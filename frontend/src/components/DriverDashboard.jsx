import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { axiosInstance } from '../lib/axios';
import { useSocketStore } from '../store/useSocketStore';
import { useAuthStore } from '../store/useAuthStore';

// --- VITE DEFAULT ICON FIX ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow });
L.Marker.prototype.options.icon = DefaultIcon;

const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const dropoffIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

export default function DriverDashboard() {
  const { authUser } = useAuthStore();
  const { socket } = useSocketStore();
  
  const [incomingRide, setIncomingRide] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [isAccepting, setIsAccepting] = useState(false);
  
  const [currentLocation, setCurrentLocation] = useState(null); 
  
  const [pickupAddress, setPickupAddress] = useState("Locating...");
  const [dropoffAddress, setDropoffAddress] = useState("Locating...");

  const [tripStatus, setTripStatus] = useState("EN_ROUTE");
  const [isUpdating, setIsUpdating] = useState(false);

  const [routePath, setRoutePath] = useState([]);
  const [routeIndex, setRouteIndex] = useState(0);

  // NEW: Online/Offline State
  const [isOnline, setIsOnline] = useState(() => {
    return localStorage.getItem("driverIsOnline") === "true";
  });

  // NEW: Toggle Function to communicate with backend
  const handleToggleStatus = () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    if (socket) {
      socket.emit("toggle_status", { isOnline: newStatus });
    }
  };

  // 1. Save to browser memory every time they toggle
useEffect(() => {
  localStorage.setItem("driverIsOnline", isOnline);
}, [isOnline]);

useEffect(() => {
  if (socket && isOnline) {
    socket.emit("toggle_status", { isOnline: true });
  }
}, [socket]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCurrentLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => {
          console.warn("GPS failed, using fallback.", err);
          setCurrentLocation([9.0310, 38.7410]); // Piassa fallback
        },
        { enableHighAccuracy: true }
      );
    } else {
      setCurrentLocation([9.0310, 38.7410]);
    }
  }, []);

  // UPDATED: Constantly emit idle location ONLY if isOnline is true!
  useEffect(() => {
    if (!socket || activeTrip || !currentLocation || !isOnline) return; 

    // Immediately emit location when going online
    socket.emit("update_location", {
      latitude: currentLocation[0],
      longitude: currentLocation[1]
    });

    // Keep emitting every 5 seconds while waiting for rides
    const interval = setInterval(() => {
      socket.emit("update_location", {
        latitude: currentLocation[0],
        longitude: currentLocation[1]
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [socket, activeTrip, currentLocation, isOnline]); // <-- Added isOnline dependency

  // Listen for new rides AND cancellations
  useEffect(() => {
    if (!socket) return;

    const handleNewRide = (rideData) => {
      setIncomingRide(rideData);
    };

    const handleCancellation = (data) => {
      alert(data.message || "The passenger cancelled the trip.");
      setIncomingRide(null);
      setActiveTrip(null);
      setTripStatus("EN_ROUTE");
      setIsAccepting(false);
      setIsUpdating(false);
      setRoutePath([]); 
    };

    socket.on("new_ride_request", handleNewRide);
    socket.on("trip_cancelled", handleCancellation); 

    return () => {
      socket.off("new_ride_request", handleNewRide);
      socket.off("trip_cancelled", handleCancellation); 
    };
  }, [socket]);

  // Fetch addresses safely
  useEffect(() => {
    if (!incomingRide) return;

    const fetchAddresses = async () => {
      try {
        const headers = { 'Accept-Language': 'en,am' };
        const osmBase = "https://nominatim.openstreetmap.org/reverse?format=json";
        const devEmail = "&email=developer@rideapp.com"; 

        const pickupRes = await fetch(`${osmBase}&lat=${incomingRide.pickup.lat}&lon=${incomingRide.pickup.lng}${devEmail}`, { headers });
        const pickupData = await pickupRes.json();
        setPickupAddress(pickupData.name || pickupData.display_name?.split(',')[0] || "Pinned Location");

        const dropoffRes = await fetch(`${osmBase}&lat=${incomingRide.dropoff.lat}&lon=${incomingRide.dropoff.lng}${devEmail}`, { headers });
        const dropoffData = await dropoffRes.json();
        setDropoffAddress(dropoffData.name || dropoffData.display_name?.split(',')[0] || "Pinned Location");
      } catch (error) {
        console.error("Failed to fetch address names", error);
        setPickupAddress("Coordinates Received");
        setDropoffAddress("Coordinates Received");
      }
    };

    fetchAddresses();
  }, [incomingRide]);

  // Fetch real road geometry from Open Source Routing Machine
  useEffect(() => {
    if (!activeTrip || !currentLocation) return;
    const getRoute = async () => {
      const targetLat = tripStatus === "EN_ROUTE" ? activeTrip.pickup.lat : activeTrip.dropoff.lat;
      const targetLng = tripStatus === "EN_ROUTE" ? activeTrip.pickup.lng : activeTrip.dropoff.lng;
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${targetLng},${targetLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const path = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          setRoutePath(path);
          setRouteIndex(0);
        }
      } catch (error) {
        console.error("Routing error", error);
      }
    };
    getRoute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip, tripStatus]); 

  // Simulate driving along the ACTUAL roads
  useEffect(() => {
    if (!activeTrip) return;

    const interval = setInterval(() => {
      if (routePath.length > 0) {
        setRouteIndex((prevIndex) => {
          const step = Math.max(1, Math.floor(routePath.length / 15)); 
          const nextIndex = prevIndex + step;
          
          if (nextIndex >= routePath.length) {
            const finalCoords = routePath[routePath.length - 1];
            setCurrentLocation(finalCoords);
            socket?.emit("update_location", { latitude: finalCoords[0], longitude: finalCoords[1], passengerId: activeTrip.passenger.id });
            return routePath.length;
          }

          const nextCoords = routePath[nextIndex];
          setCurrentLocation(nextCoords);
          socket?.emit("update_location", { latitude: nextCoords[0], longitude: nextCoords[1], passengerId: activeTrip.passenger.id });
          return nextIndex;
        });
      } else {
        // Fallback straight-line
        setCurrentLocation((prev) => {
          const targetLat = tripStatus === "EN_ROUTE" ? activeTrip.pickup.lat : activeTrip.dropoff.lat;
          const targetLng = tripStatus === "EN_ROUTE" ? activeTrip.pickup.lng : activeTrip.dropoff.lng;
          
          const newLat = prev[0] + (targetLat - prev[0]) * 0.05;
          const newLng = prev[1] + (targetLng - prev[1]) * 0.05;
          
          socket?.emit("update_location", {
            latitude: newLat,
            longitude: newLng,
            passengerId: activeTrip.passenger.id
          });
          
          return [newLat, newLng];
        });
      }
    }, 2000); 

    return () => clearInterval(interval);
  }, [activeTrip, tripStatus, routePath, socket]);

  // Accept Ride Handler
  const handleAccept = async () => {
    if (!incomingRide) return;
    setIsAccepting(true);
    try {
      await axiosInstance.put(`/trips/${incomingRide.tripId}/respond`, { status: "ACCEPTED" });
      setActiveTrip(incomingRide); 
      setIncomingRide(null); 
    } catch (error) {
      alert("Failed to accept ride: " + (error.response?.data?.message || error.message));
    } finally {
      setIsAccepting(false);
    }
  };

  // Decline Handler
  const handleDecline = async () => {
    if (!incomingRide) return;
    try {
      await axiosInstance.put(`/trips/${incomingRide.tripId}/respond`, { status: "CANCELLED" });
    } catch (error) {
      console.error("Failed to decline ride:", error);
    } finally {
      setIncomingRide(null);
    }
  };

  // Pick up the passenger
  const handlePickup = async () => {
    setIsUpdating(true);
    try {
      await axiosInstance.put(`/trips/${activeTrip.tripId}/respond`, { status: "IN_PROGRESS" });
      setTripStatus("IN_PROGRESS");
      setRoutePath([]); 
    } catch (error) {
      alert("Failed to update status: " + (error.response?.data?.message || error.message));
    } finally {
      setIsUpdating(false);
    }
  };

  // Complete Trip
  const handleComplete = async () => {
    setIsUpdating(true);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${activeTrip.pickup.lng},${activeTrip.pickup.lat};${currentLocation[1]},${currentLocation[0]}?overview=false`;
      const res = await fetch(url);
      const data = await res.json();
      const realDistanceInMeters = data.routes[0].distance;
      
      const actualFare = Math.round(100 + (realDistanceInMeters / 1000) * 25);

      await axiosInstance.put(`/trips/${activeTrip.tripId}/respond`, { 
        status: "COMPLETED",
        finalFare: actualFare 
      });
      
      alert(`Trip completed! Passenger paid: ${actualFare} ETB`);
      setActiveTrip(null);
      setTripStatus("EN_ROUTE");
      setRoutePath([]);
    } catch (error) {
      alert("Failed to complete trip: " + (error.response?.data?.message || error.message));
    } finally {
      setIsUpdating(false);
    }
  };

  const displayTrip = incomingRide || activeTrip;

  if (!currentLocation) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black flex-col">
        <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-green-500 mb-4"></div>
        <h2 className="font-bold text-white">Starting GPS Module...</h2>
        <p className="text-sm text-gray-400">Please allow location access.</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative", zIndex: 0 }}>
      
      {/* UPDATED: INTERACTIVE DRIVER STATUS BAR (Click to Toggle) */}
      <div className="absolute top-4 left-0 w-full px-4 z-[1000]">
        <div 
          onClick={handleToggleStatus}
          className={`max-w-md mx-auto rounded-xl shadow-lg px-5 py-4 flex justify-between items-center cursor-pointer transition-colors border-2 ${
            isOnline ? "bg-black border-green-500 text-white" : "bg-gray-800 border-red-500 text-gray-300"
          }`}
        >
          <div>
            <p className="font-bold text-lg">{authUser?.name}</p>
            <p className={`text-sm font-medium ${isOnline ? "text-green-400" : "text-red-400"}`}>
              {isOnline ? "Online & Searching..." : "Offline (Tap to Go Online)"}
            </p>
          </div>
          <div className={`h-5 w-5 rounded-full ${isOnline ? "bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]" : "bg-red-500"}`}></div>
        </div>
      </div>

      <MapContainer center={currentLocation} zoom={14} style={{ height: "100%", width: "100%", zIndex: 10 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        {routePath.length > 0 && <Polyline positions={routePath} color="#3b82f6" weight={6} opacity={0.8} />}

        <Marker position={currentLocation}>
          <Popup>Your Vehicle</Popup>
        </Marker>

        {displayTrip && (
          <>
            <Marker position={[displayTrip.pickup.lat, displayTrip.pickup.lng]} icon={pickupIcon}>
              <Popup>Passenger Pickup</Popup>
            </Marker>
            <Marker position={[displayTrip.dropoff.lat, displayTrip.dropoff.lng]} icon={dropoffIcon}>
              <Popup>Destination</Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      {/* INCOMING RIDE OVERLAY */}
      {incomingRide && (
        <div className="absolute bottom-0 left-0 w-full p-4 z-[1000]">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-black p-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                {incomingRide.passenger?.profilePic ? (
                  <img src={incomingRide.passenger.profilePic} alt="Passenger" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-gray-500 font-bold">P</span>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500 font-medium">Passenger</p>
                  <p className="font-bold text-gray-900">{incomingRide.passenger?.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500 font-medium">Fare</p>
                <p className="font-black text-2xl text-gray-900">{incomingRide.fare} ETB</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-100">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-3 h-3 rounded-full bg-blue-500 mt-1"></div>
                <div>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Pickup</p>
                  <p className="font-semibold text-gray-900">{pickupAddress}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 mt-1"></div>
                <div>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Dropoff</p>
                  <p className="font-semibold text-gray-900">{dropoffAddress}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleDecline} className="w-1/3 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-200">Decline</button>
              <button onClick={handleAccept} disabled={isAccepting} className="w-2/3 bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-green-600 disabled:bg-gray-400">
                {isAccepting ? 'Accepting...' : 'Accept Ride'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE TRIP OVERLAY */}
      {activeTrip && (
        <div className="absolute bottom-0 left-0 w-full p-4 z-[1000]">
          <div className="max-w-md mx-auto bg-black text-white rounded-2xl shadow-2xl overflow-hidden p-6 border-t-4 border-green-500">
            
            <h3 className="font-bold text-xl mb-1 text-green-400">
              {tripStatus === "EN_ROUTE" ? "🚗 En route to passenger..." : "🛣️ Trip in progress..."}
            </h3>
            <p className="text-gray-300 mb-4">
              {tripStatus === "EN_ROUTE" ? "Follow the map to the passenger destination." : "Drive to the destination pin."}
            </p>
            
            <div className="flex justify-between items-center border-t border-gray-700 pt-4 mb-4">
              <span>{activeTrip.passenger?.name}</span>
              <span className="font-bold text-gray-400 text-sm">Dynamic Fare</span>
            </div>

            {tripStatus === "EN_ROUTE" ? (
              <button 
                onClick={handlePickup} 
                disabled={isUpdating}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-blue-700 transition-colors"
              >
                {isUpdating ? "Updating..." : "Passenger Picked Up"}
              </button>
            ) : (
              <button 
                onClick={handleComplete} 
                disabled={isUpdating}
                className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-green-600 transition-colors"
              >
                {isUpdating ? "Updating..." : "Complete Dropoff"}
              </button>
            )}

          </div>
        </div>
      )}

    </div>
  );
}