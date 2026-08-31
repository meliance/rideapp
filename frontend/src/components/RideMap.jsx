import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { axiosInstance } from '../lib/axios';

// --- VITE DEFAULT ICON FIX ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow });
L.Marker.prototype.options.icon = DefaultIcon;
// -----------------------------

const carIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3204/3204121.png', 
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

// A red icon for the destination
const destinationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function RideMap() {
  const [drivers, setDrivers] = useState([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState('');
  
  // NEW: Search and Destination states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [destination, setDestination] = useState(null);
  const [estimatedFee, setEstimatedFee] = useState(0);
  
  const position = [9.0300, 38.7400]; // Passenger Pickup Location

  const fetchNearbyDrivers = async () => {
    try {
      const res = await axiosInstance.get(`/drivers/nearby?latitude=${position[0]}&longitude=${position[1]}`);
      setDrivers(res.data.drivers || []);
    } catch (error) {
      console.error("Failed to fetch drivers", error);
    }
  };

  useEffect(() => {
    fetchNearbyDrivers(); 
    const interval = setInterval(fetchNearbyDrivers, 10000); 
    return () => clearInterval(interval); 
  }, []);

  // 1. Search OpenStreetMap for places as the user types
  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    try {
      // We add a viewbox around Addis Ababa to prioritize local results
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5&viewbox=38.6,8.8,38.9,9.1&bounded=1`);
      const data = await res.json();
      setSearchResults(data);
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  // 2. Calculate real distance using Leaflet's built-in math
  const calculateFee = (lat, lng) => {
    const start = L.latLng(position[0], position[1]);
    const end = L.latLng(lat, lng);
    const distanceInMeters = start.distanceTo(end);
    
    // Pricing Logic: 100 ETB Base Fare + 25 ETB per Kilometer
    const baseFare = 100;
    const perKmRate = 25;
    const totalFee = baseFare + (distanceInMeters / 1000) * perKmRate;
    
    setEstimatedFee(Math.round(totalFee));
  };

  // 3. User clicks a place from the search results
  const handleSelectPlace = (place) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const placeName = place.display_name.split(',')[0]; // Grab just the main building/street name

    setDestination({ name: placeName, lat, lng });
    setSearchQuery(placeName);
    setSearchResults([]);
    calculateFee(lat, lng);
  };

  // 4. Request the ride using the dynamically selected destination
  const handleRequestRide = async () => {
    if (!destination) return;
    
    if (drivers.length === 0) {
      setRequestStatus('No drivers available nearby.');
      return;
    }

    setIsRequesting(true);
    setRequestStatus('');

    // Automatically assign the ride to the closest available driver
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

      await axiosInstance.post('/trips/request', payload);
      setRequestStatus('Ride requested! Waiting for driver to accept...');
      
    } catch (error) {
      setRequestStatus(error.response?.data?.message || 'Failed to request ride');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleCancel = () => {
    setDestination(null);
    setSearchQuery('');
    setRequestStatus('');
    setIsRequesting(false);
  };

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

        {/* Driver Markers */}
        {drivers.map((driver) => (
          <Marker key={driver.driver_id} position={[driver.latitude, driver.longitude]} icon={carIcon} />
        ))}
      </MapContainer>

      {/* CHECKOUT LAYER (Bottom) */}
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
                <button 
                  onClick={handleCancel}
                  className="text-red-500 text-sm font-bold hover:text-red-700 transition-colors"
                >
                  Cancel Request
                </button>
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