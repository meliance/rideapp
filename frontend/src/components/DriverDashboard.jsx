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
  const { socket } = useSocketStore();

  const [drivers, setDrivers] = useState([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [destination, setDestination] = useState(null);
  const [estimatedFee, setEstimatedFee] = useState(0);
  
  const [liveDriverLocation, setLiveDriverLocation] = useState(null);
  const [currentTripId, setCurrentTripId] = useState(null); 
  const [tripStatus, setTripStatus] = useState(null); 

  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
        (err) => {
          console.warn("GPS failed, using Piassa fallback.", err);
          setPosition([9.0300, 38.7400]); 
        },
        { enableHighAccuracy: true }
      );
    } else {
      setPosition([9.0300, 38.7400]);
    }
  }, []);

  const fetchNearbyDrivers = async () => {
    if (liveDriverLocation || !position) return; 

    try {
      const res = await axiosInstance.get(`/drivers/nearby?latitude=${position[0]}&longitude=${position[1]}`);
      setDrivers(res.data.drivers || []);
    } catch (error) {
      console.error("Failed to fetch drivers", error);
    }
  };

  useEffect(() => {
    if (!position) return; 
    fetchNearbyDrivers(); 
    const interval = setInterval(fetchNearbyDrivers, 10000); 
    return () => clearInterval(interval); 
  }, [liveDriverLocation, position]); 

  //Auto-timeout if no driver accepts within 60 seconds
  useEffect(() => {
    let timeout;
    
    // Only start the timer if they are actively waiting for a driver
    if (tripStatus === 'REQUESTED' && currentTripId) {
      timeout = setTimeout(async () => {
        // 1. Cancel the trip on the backend
        try {
          await axiosInstance.put(`/trips/${currentTripId}/cancel`);
        } catch (error) {
          console.error("Auto-cancel failed", error);
        }
        
        // 2. Alert the user
        alert("No drivers responded in time. Please try again.");
        
        // 3. Reset the UI completely
        setDestination(null);
        setSearchQuery('');
        setRequestStatus('');
        setIsRequesting(false);
        setLiveDriverLocation(null); 
        setCurrentTripId(null);
        setTripStatus(null);
      }, 60000); // 60,000 ms = 1 minute
    }

    // Cleanup function: destroys the timer if the component unmounts OR if tripStatus changes (e.g. driver accepted)
    return () => clearTimeout(timeout);
  }, [tripStatus, currentTripId]);

  useEffect(() => {
    if (!socket) return;

    const handleDriverMove = (coords) => {
      setLiveDriverLocation([coords.latitude, coords.longitude]);
    };

    const handleStatusUpdate = (data) => {
      setTripStatus(data.status); 

      if (data.status === "ACCEPTED") {
        setRequestStatus("Driver accepted! They are on the way.");
      } 
      else if (data.status === "IN_PROGRESS") {
        setRequestStatus("You are in the car. Enjoy the ride!");
      } 
      else if (data.status === "COMPLETED" || data.status === "CANCELLED") {
        alert(data.status === "COMPLETED" ? "You have arrived! Trip Complete." : "Trip was cancelled.");
        
        setLiveDriverLocation(null);
        setDestination(null);
        setSearchQuery('');
        setRequestStatus('');
        setIsRequesting(false);
        setCurrentTripId(null);
        setTripStatus(null); 
      }
    };

    socket.on("driver_location_update", handleDriverMove);
    socket.on("trip_status_updated", handleStatusUpdate);

    return () => {
      socket.off("driver_location_update", handleDriverMove);
      socket.off("trip_status_updated", handleStatusUpdate);
    };
  }, [socket]);

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

  const calculateFee = (lat, lng) => {
    const start = L.latLng(position[0], position[1]);
    const end = L.latLng(lat, lng);
    const distanceInMeters = start.distanceTo(end);
    
    const baseFare = 100;
    const perKmRate = 25;
    const totalFee = baseFare + (distanceInMeters / 1000) * perKmRate;
    
    setEstimatedFee(Math.round(totalFee));
  };

  const handleSelectPlace = (place) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const placeName = place.display_name.split(',')[0]; 

    setDestination({ name: placeName, lat, lng });
    setSearchQuery(placeName);
    setSearchResults([]);
    calculateFee(lat, lng);
  };

  const handleRequestRide = async () => {
    if (!destination || drivers.length === 0) return; // Safety block

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
      setTripStatus('REQUESTED'); 
      setRequestStatus('Waiting for driver to accept...'); // Simplified text
      
    } catch (error) {
      setRequestStatus(error.response?.data?.message || 'Failed to request ride');
      setIsRequesting(false); // Reset so they can try again
    } 
  };

  const handleCancel = async () => {
    if (currentTripId) {
      try {
        await axiosInstance.put(`/trips/${currentTripId}/cancel`);
      } catch (error) {
        console.error("Failed to cancel trip on backend", error);
      }
    }
    
    setDestination(null);
    setSearchQuery('');
    setRequestStatus('');
    setIsRequesting(false);
    setLiveDriverLocation(null); 
    setCurrentTripId(null);
    setTripStatus(null);
  };

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
      
      {/* SEARCH BAR LAYER */}
      <div className="absolute top-4 left-0 w-full px-4 z-[1000]">
        <div className="max-w-md mx-auto relative">
          <input 
            type="text" 
            placeholder="Where to?" 
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-white rounded-xl shadow-lg px-5 py-4 text-lg font-bold border-2 border-transparent focus:border-black focus:outline-none transition-all"
          />
          
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
        
        <Marker position={position}>
          <Popup>Your Pickup Location</Popup>
        </Marker>

        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
            <Popup>{destination.name}</Popup>
          </Marker>
        )}

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

      {/* CHECKOUT LAYER */}
      {destination && (
        <div className="absolute bottom-0 left-0 w-full p-4 z-[1000] pointer-events-none">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto border border-gray-100 p-6">
            
            <h3 className="text-xl font-bold text-gray-900 mb-1">Ride to {destination.name}</h3>
            <div className="flex justify-between items-center border-t border-gray-100 pt-4 mb-4 mt-2">
              <span className="text-gray-500 font-medium">Standard Ride</span>
              <span className="font-black text-2xl text-gray-900">{estimatedFee} ETB</span>
            </div>

            {requestStatus ? (
              <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
                
                {/*Animated spinner while waiting for driver to accept */}
                {tripStatus === 'REQUESTED' && (
                  <div className="h-8 w-8 animate-spin rounded-full border-b-4 border-black mb-3"></div>
                )}
                
                <p className="font-medium text-gray-900 mb-3">{requestStatus}</p>
                
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
                  disabled={isRequesting || drivers.length === 0}
                  className="w-2/3 bg-black text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
                >
                  {/*Dynamic button text prevents the user from clicking when no drivers exist */}
                  {isRequesting ? 'Processing...' : (drivers.length === 0 ? 'No Drivers Nearby' : 'Confirm')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}