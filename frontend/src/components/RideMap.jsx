import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
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

  // <-- NEW: State to hold the driver's details! -->
  const [assignedDriver, setAssignedDriver] = useState(null);

  const [position, setPosition] = useState(null);
  const [routePath, setRoutePath] = useState([]);

  const finalDriverLocation = useRef(null);
  const searchTimeoutRef = useRef(null);

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

  // Auto-timeout if driver ignores the request for 60 seconds
  useEffect(() => {
    let timeout;
    if (tripStatus === 'REQUESTED' && currentTripId) {
      timeout = setTimeout(async () => {
        try {
          await axiosInstance.put(`/trips/${currentTripId}/cancel`);
        } catch (error) {
          console.error("Auto-cancel failed on backend", error);
        }
        
        setRequestStatus("No drivers responded in time.");
        setIsRequesting(false);
        setCurrentTripId(null);
        setTripStatus(null);
      }, 60000); 
    }

    return () => clearTimeout(timeout);
  }, [tripStatus, currentTripId]);

  useEffect(() => {
    if (!socket) return;

    const handleDriverMove = (coords) => {
      setLiveDriverLocation([coords.latitude, coords.longitude]);
      finalDriverLocation.current = [coords.latitude, coords.longitude];
    };

    const handleStatusUpdate = (data) => {
      setTripStatus(data.status);
      setRoutePath([]); 

      if (data.status === "ACCEPTED") {
        setRequestStatus("Driver accepted! They are on the way.");
        if (data.driver) setAssignedDriver(data.driver);
      } 
      else if (data.status === "IN_PROGRESS") {
        setRequestStatus("You are in the car. Enjoy the ride!");
        if (data.driver) setAssignedDriver(data.driver);
      } 
      else if (data.status === "COMPLETED") {
        setTimeout(() => {
          const paidAmount = data.finalFare || estimatedFee; 
          alert(`You have arrived! Trip Complete with total fee: ${paidAmount} ETB`);
          
          setLiveDriverLocation(null);
          setDestination(null);
          setSearchQuery('');
          setRequestStatus('');
          setIsRequesting(false);
          setCurrentTripId(null);
          setTripStatus(null); 
          setRoutePath([]); 
          setAssignedDriver(null); // <-- Clear driver details
        }, 100);
      }
      else if (data.status === "CANCELLED") {
        setRequestStatus('Your request is not accepted.');
        setIsRequesting(false);
        setCurrentTripId(null);
        setTripStatus(null);
        setAssignedDriver(null);
      }
    };

    socket.on("driver_location_update", handleDriverMove);
    socket.on("trip_status_updated", handleStatusUpdate);

    return () => {
      socket.off("driver_location_update", handleDriverMove);
      socket.off("trip_status_updated", handleStatusUpdate);
    };
  }, [socket, estimatedFee, position]);

  useEffect(() => {
    if (!position) return;
    
    const getRouteAndFee = async () => {
      try {
        let start, end;
        
        if (!tripStatus && destination) {
          start = position; end = [destination.lat, destination.lng];
        } 
        else if (tripStatus === 'ACCEPTED' && liveDriverLocation) {
          start = liveDriverLocation; end = position; 
        } 
        else if (tripStatus === 'IN_PROGRESS' && destination) {
          start = position; end = [destination.lat, destination.lng]; 
        } else {
          return;
        }

        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.routes && data.routes.length > 0) {
          const path = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          setRoutePath(path);

          if (!tripStatus) {
             const roadDistanceInMeters = data.routes[0].distance;
             setEstimatedFee(Math.round(100 + (roadDistanceInMeters / 1000) * 25));
          }
        }
      } catch (error) {
        console.error("Routing error", error);
      }
    };

    getRouteAndFee();
  }, [tripStatus, liveDriverLocation, position, destination]);

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=et&email=developer@rideapp.com`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error("API rejected the request");
        
        const data = await res.json();
        setSearchResults(data);
      } catch (error) {
        console.error("Search failed:", error);
      }
    }, 500);
  };

  const handleSelectPlace = (place) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const placeName = place.display_name.split(',')[0]; 

    setDestination({ name: placeName, lat, lng });
    setSearchQuery(placeName);
    setSearchResults([]);
  };

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
      setTripStatus('REQUESTED'); 
      setRequestStatus('Ride requested! Waiting for driver to accept...');
      
    } catch (error) {
      setRequestStatus(error.response?.data?.message || 'Failed to request ride');
      setIsRequesting(false);
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
    setRoutePath([]);
    setAssignedDriver(null); // <-- Clear driver details
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

  const isErrorStatus = requestStatus === 'No drivers available nearby.' || requestStatus === 'Your request is not accepted.' || requestStatus === 'No drivers responded in time.';

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative", zIndex: 0 }}>
    
      {/* SEARCH BAR LAYER (Top) */}
      <div className="absolute top-4 left-12 w-full px-4 z-[1000]">
        <div className="max-w-md mx-auto relative">
          <input 
            type="text" 
            placeholder="Where to?" 
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-white rounded-xl shadow-lg pl-4 pr-5 py-4 text-lg font-bold border-2 border-transparent focus:border-black focus:outline-none transition-all"
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
        
        {routePath.length > 0 && <Polyline positions={routePath} color="#3b82f6" weight={6} opacity={0.8} />}

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
              <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
                
                {tripStatus === 'REQUESTED' && !isErrorStatus && (
                  <div className="h-8 w-8 animate-spin rounded-full border-b-4 border-black mb-3 mx-auto"></div>
                )}
                
                {/* <-- NEW: Driver Profile Card (Replaces the bouncy car emoji) --> */}
                {(tripStatus === 'ACCEPTED' || tripStatus === 'IN_PROGRESS') && assignedDriver ? (
                  <div className="w-full bg-white rounded-xl p-4 mb-4 border border-gray-100 flex items-center justify-between text-left shadow-sm">
                    <div className="flex items-center gap-3">
                      {assignedDriver.profilePic ? (
                        <img src={assignedDriver.profilePic} alt="Driver" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-500 font-bold text-lg">D</span>
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-gray-900">{assignedDriver.name || "Your Driver"}</p>
                        <p className="text-xs text-gray-500 font-medium">
                          {assignedDriver.carModel || "Standard Car"} • {assignedDriver.plateNumber || "N/A"}
                        </p>
                      </div>
                    </div>
                    {assignedDriver.phone && (
                      <a 
                        href={`tel:${assignedDriver.phone}`} 
                        className="bg-green-100 text-green-700 w-10 h-10 rounded-full flex items-center justify-center hover:bg-green-200 transition-colors"
                        title="Call Driver"
                      >
                        📞
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    {tripStatus === 'ACCEPTED' && <div className="text-4xl mb-3 animate-bounce">🚘</div>}
                    {tripStatus === 'IN_PROGRESS' && <div className="text-4xl mb-3">🎉</div>}
                  </>
                )}

                <p className={`font-medium mb-3 ${isErrorStatus ? 'text-red-500 font-bold' : 'text-gray-900'}`}>
                  {requestStatus}
                </p>
                
                {tripStatus !== 'IN_PROGRESS' && (
                  <button 
                    onClick={() => {
                      if (isErrorStatus) {
                        setRequestStatus(''); 
                      } else {
                        handleCancel();
                      }
                    }}
                    className={`${isErrorStatus ? 'text-gray-500 hover:text-gray-700' : 'text-red-500 hover:text-red-700'} text-sm font-bold transition-colors mt-2`}
                  >
                    {isErrorStatus ? 'Try Again' : 'Cancel Request'}
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