import { useState, useEffect, useRef } from 'react';
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
  const [isAccepting, setIsAccepting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null); 
  const [pickupAddress, setPickupAddress] = useState("Locating...");
  const [dropoffAddress, setDropoffAddress] = useState("Locating...");
  const [isUpdating, setIsUpdating] = useState(false);
  const [liveEta, setLiveEta] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [routeIndex, setRouteIndex] = useState(0);

  // 1. LOCAL STORAGE STATES
  const [activeTrip, setActiveTrip] = useState(() => {
    const saved = localStorage.getItem('driver_activeTrip');
    return saved ? JSON.parse(saved) : null;
  });
  const [tripStatus, setTripStatus] = useState(() => {
    return localStorage.getItem('driver_tripStatus') || "EN_ROUTE";
  });
  const [isOnline, setIsOnline] = useState(() => {
    return localStorage.getItem("driverIsOnline") === "true";
  });

  // 2. AUTO-SAVE HOOKS
  useEffect(() => {
    if (activeTrip) localStorage.setItem('driver_activeTrip', JSON.stringify(activeTrip));
    else localStorage.removeItem('driver_activeTrip');
  }, [activeTrip]);

  useEffect(() => {
    localStorage.setItem('driver_tripStatus', tripStatus);
  }, [tripStatus]);

  useEffect(() => {
    localStorage.setItem("driverIsOnline", isOnline);
  }, [isOnline]);

  // 3. AUDIO SYSTEM
  const ringAudio = useRef(typeof Audio !== "undefined" ? new Audio('/ringtone.mp3') : null);

  const stopRing = () => {
    if (ringAudio.current) {
      ringAudio.current.pause();
      ringAudio.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (incomingRide) {
      const timer = setTimeout(() => {
        setIncomingRide(null);
        stopRing();
      }, 60000);
      return () => clearTimeout(timer);
    }
  }, [incomingRide]);

  // 4. STATUS & WAKE LOCK
 const handleToggleStatus = () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    
    if (socket) {
      socket.emit("toggle_status", { isOnline: newStatus });
    }
    
    if (ringAudio.current && newStatus) {
      const playPromise = ringAudio.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          ringAudio.current.pause();
          ringAudio.current.currentTime = 0;
        }).catch(err => console.warn("Chrome blocked unlock:", err));
      }
    }
  };

  useEffect(() => {
    if (socket && isOnline) {
      socket.emit("toggle_status", { isOnline: true });
    }
  }, [socket, isOnline]);

  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if (isOnline && 'wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn("Wake Lock blocked by device", err);
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, [isOnline]);

  // 5. GPS & SOCKET SYNC
  useEffect(() => {
    if (!socket || !currentLocation || !isOnline || authUser?.status === 'PENDING' || authUser?.status === 'REJECTED') return; 
    const payload = {
      latitude: currentLocation[0],
      longitude: currentLocation[1],
      ...(activeTrip && { passengerId: activeTrip.passenger.id }) 
    };

    socket.emit("update_location", payload);
    const interval = setInterval(() => {
      socket.emit("update_location", payload);
    }, 5000);

    return () => clearInterval(interval);
  }, [socket, activeTrip, currentLocation, isOnline, authUser]);

  useEffect(() => {
    if (!socket) return;

    const handleNewRide = (rideData) => {
      setIncomingRide(rideData);
      if (ringAudio.current) {
        ringAudio.current.loop = true;
        ringAudio.current.play().catch(err => console.warn("Browser blocked autoplay:", err));
      }
    };

    const handleCancellation = (data) => {
      stopRing();
      alert(data.message || "The passenger cancelled the trip.");
      setIncomingRide(null);
      setActiveTrip(null);
      setTripStatus("EN_ROUTE");
      setIsAccepting(false);
      setIsUpdating(false);
      setRoutePath([]); 
    };

    const handleTripClaimedByOther = (data) => {
      setIncomingRide((currentIncoming) => {
        if (currentIncoming && currentIncoming.tripId === data.tripId) {
          stopRing();
          return null; 
        }
        return currentIncoming;
      });
    };

    socket.on("new_ride_request", handleNewRide);
    socket.on("trip_cancelled", handleCancellation); 
    socket.on("trip_claimed", handleTripClaimedByOther);

    return () => {
      socket.off("new_ride_request", handleNewRide);
      socket.off("trip_cancelled", handleCancellation); 
      socket.off("trip_claimed", handleTripClaimedByOther);
      stopRing();
    };
  }, [socket]);

  // 6. ADDRESS & ROUTING
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

          const distanceInKm = (data.routes[0].distance / 1000).toFixed(1);
          const timeInMin = Math.ceil(data.routes[0].duration / 60);
          setLiveEta({ distance: distanceInKm, time: timeInMin });
        }
      } catch (error) {
        console.error("Routing error", error);
      }
    };
    getRoute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip, tripStatus, currentLocation]);

  // 7. REAL-TIME HARDWARE TRACKER
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCurrentLocation([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.warn("GPS failed, using fallback.", err);
          setCurrentLocation((prev) => prev || [9.0310, 38.7410]); 
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 } 
      );

      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setCurrentLocation([9.0310, 38.7410]);
    }
  }, []);

  // 8. HANDLERS
  const handleAccept = async () => {
    if (!incomingRide) return;
    stopRing();
    setIsAccepting(true);
    try {
      await axiosInstance.put(`/trips/${incomingRide.tripId}/respond`, { status: "ACCEPTED" });
      setActiveTrip(incomingRide); 
      setIncomingRide(null); 
    } catch (error) {
      alert("Failed to accept ride: " + (error.response?.data?.message || error.message));
      setIncomingRide(null); 
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!incomingRide) return;
    stopRing();
    try {
      await axiosInstance.put(`/trips/${incomingRide.tripId}/respond`, { status: "CANCELLED" });
    } catch (error) {
      console.error("Failed to decline ride:", error);
    } finally {
      setIncomingRide(null);
    }
  };

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

  const handleComplete = async () => {
    setIsUpdating(true);

    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const finalLat = pos.coords.latitude;
        const finalLng = pos.coords.longitude;
        
        const url = `https://router.project-osrm.org/route/v1/driving/${activeTrip.pickup.lng},${activeTrip.pickup.lat};${finalLng},${finalLat}?overview=false`;
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
        alert("Failed to complete trip: " + (error.message));
      } finally {
        setIsUpdating(false);
      }
    }, 
    (err) => {
      alert("Waiting for GPS signal to wake up... try again in 3 seconds.");
      setIsUpdating(false);
    }, 
    { enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  const displayTrip = incomingRide || activeTrip;

  // 9. RENDER UI
  if (authUser?.status === 'PENDING') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border-t-4 border-blue-500">
          <div className="text-6xl mb-4 animate-pulse">📄</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verifying Documents</h2>
          <p className="text-gray-600 mb-6">
            We have received your Application. Our team is currently reviewing them.
          </p>
          
          <div className="bg-blue-50 rounded-lg p-5 text-sm text-blue-800 text-left border border-blue-100">
            <p className="font-bold mb-1">What happens next?</p>
            <p>Reviews typically take 1-2 days during business days. Once approved, this screen will automatically turn into your live map, and you can start accepting rides!</p>
          </div>

          <button 
            onClick={() => window.location.reload()} 
            className="mt-6 w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md"
          >
            Check Status Again
          </button>
        </div>
      </div>
    );
  }

  if (authUser?.status === 'REJECTED') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border-t-4 border-red-500">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Declined</h2>
          <p className="text-gray-600 mb-6">
            Unfortunately, our team was unable to approve your driver application at this time.
          </p>
          
          <div className="bg-red-50 rounded-lg p-5 text-sm text-red-800 text-left border border-red-100 mb-6">
            <p className="font-bold mb-1">Common reasons for decline:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Documents were blurry or unreadable.</li>
              <li>The Driver's License was expired.</li>
              <li>Vehicle details did not match the Libre.</li>
            </ul>
          </div>

          <button 
            onClick={() => window.location.href = "mailto:support@rideapp.com"} 
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-md"
          >
            Contact Support
          </button>
        </div>
      </div>
    );
  }

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
    <div className="h-[100dvh] w-full relative z-0 overflow-hidden bg-gray-50">
      
      <div className="absolute top-4 left-16 right-4 z-[1000]">
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

      <div className="absolute inset-0 z-10">
        <MapContainer center={currentLocation} zoom={14} className="h-full w-full" zoomControl={false}>
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
      </div>

      {incomingRide && (
        <div className="absolute bottom-0 left-0 w-full p-4 pb-8 z-[1000]">
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

      {activeTrip && (
        <div className="absolute bottom-0 left-0 w-full p-4 pb-8 z-[1000]">
          <div className="max-w-md mx-auto bg-black text-white rounded-2xl shadow-2xl overflow-hidden p-6 border-t-4 border-green-500">
            
            <h3 className="font-bold text-xl mb-1 text-green-400">
              {tripStatus === "EN_ROUTE" ? "🚗 En route to passenger..." : "🛣️ Trip in progress..."}
            </h3>
            <p className="text-gray-300 mb-4">
              {tripStatus === "EN_ROUTE" ? "Follow the map to the passenger destination." : "Drive to the destination pin."}
            </p>
            
            <div className="flex justify-between items-center border-t border-gray-700 pt-4 mb-4">
              <span className="font-bold text-lg">{activeTrip.passenger?.name}</span>
              
              <div className="flex items-center gap-3">
                {liveEta && (
                  <div className="text-right">
                     <p className="text-green-400 font-bold text-lg">{liveEta.time} min</p>
                     <p className="text-gray-400 text-xs">{liveEta.distance} km remaining</p>
                  </div>
                )}

                {tripStatus === "EN_ROUTE" && activeTrip.passenger?.phoneNumber ? (
                  <a 
                    href={`tel:${activeTrip.passenger.phoneNumber}`} 
                    className="bg-green-900 text-green-400 w-10 h-10 rounded-full flex items-center justify-center border border-green-700 hover:bg-green-800 transition-colors shadow-sm"
                    title="Call Passenger"
                  >
                    📞
                  </a>
                ) : (
                  <span className="font-bold text-gray-400 text-sm">Dynamic Fare</span>
                )}
              </div>
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