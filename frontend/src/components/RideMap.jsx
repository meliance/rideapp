import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { axiosInstance } from '../lib/axios';
import { useSocketStore } from '../store/useSocketStore';

// --- VITE DEFAULT ICON FIX ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow });
L.Marker.prototype.options.icon = DefaultIcon;

const carIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3204/3204121.png', 
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const destinationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function RideMap() {
  const { socket } = useSocketStore(); // Extract socket

  const [drivers, setDrivers] = useState([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState('');
  
  // Search and Destination states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [destination, setDestination] = useState(null);
  const [estimatedFee, setEstimatedFee] = useState(0);
  
  // State for the moving driver & active trip
  const [liveDriverLocation, setLiveDriverLocation] = useState(null);
  const [currentTripId, setCurrentTripId] = useState(null); 
  const [tripStatus, setTripStatus] = useState(null); // NEW: Track exact status to hide cancel button

  const [position, setPosition] = useState(null);

  // Fetch real GPS location when the app loads
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
        (err) => {
          console.warn("GPS failed, using Piassa fallback.", err);
          setPosition([9.0300, 38.7400]); // Fallback if user denies permission
        },
        { enableHighAccuracy: true }
      );
    } else {
      setPosition([9.0300, 38.7400]);
    }
  }, []);

  // Poll for nearby drivers
  const fetchNearbyDrivers = async () => {
    // Only poll if GPS is loaded and we aren't tracking a live driver
    if (liveDriverLocation || !position) return; 

    try {
      const res = await axiosInstance.get(`/drivers/nearby?latitude=${position[0]}&longitude=${position[1]}`);
      setDrivers(res.data.drivers || []);
    } catch (error) {
      console.error("Failed to fetch drivers", error);
    }
  };

  useEffect(() => {
    if (!position) return; // Wait for GPS before polling
    fetchNearbyDrivers(); 
    const interval = setInterval(fetchNearbyDrivers, 10000); 
    return () => clearInterval(interval); 
  }, [liveDriverLocation, position]); 

  // Listen for live driver movement AND status updates
  useEffect(() => {
    if (!socket) return;

    // 1. Movement listener
    const handleDriverMove = (coords) => {
      setLiveDriverLocation([coords.latitude, coords.longitude]);
    };

    // 2. Status update listener
    const handleStatusUpdate = (data) => {
      setTripStatus(data.status); // <-- NEW: Save status in state

      if (data.status === "ACCEPTED") {
        setRequestStatus("Driver accepted! They are on the way.");
      } 
      else if (data.status === "IN_PROGRESS") {
        setRequestStatus("You are in the car. Enjoy the ride!");
      } 
      else if (data.status === "COMPLETED" || data.status === "CANCELLED") {
        alert(data.status === "COMPLETED" ? "You have arrived! Trip Complete." : "Trip was cancelled.");
        
        // Wipe the state clean so they can request a brand new ride!
        setLiveDriverLocation(null);
        setDestination(null);
        setSearchQuery('');
        setRequestStatus('');
        setIsRequesting(false);
        setCurrentTripId(null);
        setTripStatus(null); // Reset status
      }
    };

    socket.on("driver_location_update", handleDriverMove);
    socket.on("trip_status_updated", handleStatusUpdate);

    return () => {
      socket.off("driver_location_update", handleDriverMove);
      socket.off("trip_status_updated", handleStatusUpdate);
    };
  }, [socket]);

  // Search OpenStreetMap for places
  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5&viewbox=38.6,8.8,38.9,9.1&bounded=1`);
      const data = await res.json();
      setSearchResults(data);
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  // Calculate real distance
  const calculateFee = (lat, lng) => {
    const start = L.latLng(position[0], position[1]);
    const end = L.latLng(lat, lng);
    const distanceInMeters = start.distanceTo(end);
    
    const baseFare = 100;
    const perKmRate = 25;
    const totalFee = baseFare + (distanceInMeters / 1000) * perKmRate;
    
    setEstimatedFee(Math.round(totalFee));
  };

  // Select a place
  const handleSelectPlace = (place) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const placeName = place.display_name.split(',')[0]; 

    setDestination({ name: placeName, lat, lng });
    setSearchQuery(placeName);
    setSearchResults([]);
    calculateFee(lat, lng);
  };

  // Request the ride
  const handleRequestRide = async () => {
    if (!destination) return;
    
    if (drivers.length === 0) {
      setRequestStatus('No drivers available nearby.');
      return;
    }

    setIsRequesting(true);
    setRequestStatus('');

    const closestDriver = drivers[0]; 

    try {
      const payload = {
        driverId: closestDriver.driver_id,
        pickupLat: position[0],
        pickupLng: position[1],
        dropoffLat: destination.lat,
        dropoffLng: destination.lng,
        fareEstimation: estimatedFee
      };

      const res = await axiosInstance.post('/trips/request', payload);
      
      setCurrentTripId(res.data.trip.id); 
      setTripStatus('REQUESTED'); // <-- Track initial state
      setRequestStatus('Ride requested! Waiting for driver to accept...');
      
    } catch (error) {
      setRequestStatus(error.response?.data?.message || 'Failed to request ride');
    } finally {
      setIsRequesting(false);
    }
  };

  // Cancel the ride and alert the backend
  const handleCancel = async () => {
    if (currentTripId) {
      try {
        await axiosInstance.put(`/trips/${currentTripId}/cancel`);
      } catch (error) {
        console.error("Failed to cancel trip on backend", error);
      }
    }
    
    // Clear local state
    setDestination(null);
    setSearchQuery('');
    setRequestStatus('');
    setIsRequesting(false);
    setLiveDriverLocation(null); 
    setCurrentTripId(null);
    setTripStatus(null);
  };

  // Render a loading screen while waiting for GPS!
  if (!position) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 flex-col">
        <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-black mb-4"></div>
        <h2 className="font-bold text-gray-700">Finding your location...</h2>
        <p className="text-sm text-gray-500">Please allow location access in your browser.</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative", zIndex: 0 }}>
      
      {/* SEARCH BAR LAYER (Top) */}
      <div className="absolute top-4 left-0 w-full px-4 z-[1000]">
        <div className="max-w-md mx-auto relative">
          <input 
            type="text" 
            placeholder="Where to?" 
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-white rounded-xl shadow-lg px-5 py-4 text-lg font-bold border-2 border-transparent focus:border-black focus:outline-none transition-all"
          />
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100">
              {searchResults.map((place) => (
                <div 
                  key={place.place_id}
                  onClick={() => handleSelectPlace(place)}
                  className="px-5 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                >
                  <p className="font-bold text-gray-900 truncate">{place.display_name.split(',')[0]}</p>
                  <p className="text-xs text-gray-500 truncate">{place.display_name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MAP LAYER */}
      <MapContainer center={position} zoom={14} style={{ height: "100%", width: "100%", zIndex: 10 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        {/* Passenger Marker */}
        <Marker position={position}>
          <Popup>Your Pickup Location</Popup>
        </Marker>

        {/* Destination Marker */}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
            <Popup>{destination.name}</Popup>
          </Marker>
        )}

        {/* Render EITHER the moving driver OR the idle drivers */}
        {liveDriverLocation ? (
          <Marker position={liveDriverLocation} icon={carIcon}>
            <Popup>Your Driver is Arriving!</Popup>
          </Marker>
        ) : (
          drivers.map((driver) => (
            <Marker key={driver.driver_id} position={[driver.latitude, driver.longitude]} icon={carIcon} />
          ))
        )}
      </MapContainer>

      {/* CHECKOUT LAYER (Bottom) */}
      {destination && (
        <div className="absolute bottom-0 left-0 w-full p-4 z-[1000] pointer-events-none">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto border border-gray-100 p-6">
            
            <h3 className="text-xl font-bold text-gray-900 mb-1">Ride to {destination.name}</h3>
            <div className="flex justify-between items-center border-t border-gray-100 pt-4 mb-4 mt-2">
              <span className="text-gray-500 font-medium">Standard Ride</span>
              <span className="font-black text-2xl text-gray-900">{estimatedFee} ETB</span>
            </div>

            {requestStatus ? (
              <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="font-medium text-gray-900 mb-3">{requestStatus}</p>
                
                {/* FIX: Only show Cancel button if they aren't in the car yet! */}
                {tripStatus !== 'IN_PROGRESS' && (
                  <button 
                    onClick={handleCancel}
                    className="text-red-500 text-sm font-bold hover:text-red-700 transition-colors mt-2"
                  >
                    Cancel Request
                  </button>
                )}
                
              </div>
            ) : (
              <div className="flex gap-3">
                <button 
                  onClick={handleCancel}
                  className="w-1/3 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleRequestRide}
                  disabled={isRequesting}
                  className="w-2/3 bg-black text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
                >
                  {isRequesting ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}