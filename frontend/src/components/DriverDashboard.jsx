import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
  const [pickupAddress, setPickupAddress] = useState("Locating...");
  const [dropoffAddress, setDropoffAddress] = useState("Locating...");
  const position = [9.0310, 38.7410]; 

  useEffect(() => {
    if (!socket) return;

    const handleNewRide = (rideData) => {
      console.log("🔔 New Ride Request!", rideData);
      setIncomingRide(rideData);
    };

    socket.on("new_ride_request", handleNewRide);

    return () => {
      socket.off("new_ride_request", handleNewRide);
    };
  }, [socket]);

  // 3. Fetch readable street names when a ride comes in
  useEffect(() => {
    if (!incomingRide) return;

    const fetchAddresses = async () => {
      try {
        // Fetch Pickup Name
        const pickupRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${incomingRide.pickup.lat}&lon=${incomingRide.pickup.lng}`);
        const pickupData = await pickupRes.json();
        setPickupAddress(pickupData.name || pickupData.display_name.split(',')[0]);

        // Fetch Dropoff Name
        const dropoffRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${incomingRide.dropoff.lat}&lon=${incomingRide.dropoff.lng}`);
        const dropoffData = await dropoffRes.json();
        setDropoffAddress(dropoffData.name || dropoffData.display_name.split(',')[0]);
      } catch (error) {
        console.error("Failed to fetch address names", error);
        setPickupAddress("Unknown Pickup Location");
        setDropoffAddress("Unknown Dropoff Location");
      }
    };

    fetchAddresses();
  }, [incomingRide]);

  // 2. Accept the Ride
      const handleAccept = async () => {
        if (!incomingRide) return;
        setIsAccepting(true);
        
        try {
          // FIX: Using exact property from your console log
          await axiosInstance.put(`/trips/${incomingRide.tripId}/respond`, {
            status: "ACCEPTED"
          });
          
          alert("Ride Accepted! Head to the pickup location.");
          setIncomingRide(null); 
          
        } catch (error) {
          alert("Failed to accept ride: " + (error.response?.data?.message || error.message));
        } finally {
          setIsAccepting(false);
        }
      };

  const handleDecline = () => {
    setIncomingRide(null);
  };

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative", zIndex: 0 }}>
      
      {/* DRIVER STATUS BAR */}
      <div className="absolute top-4 left-0 w-full px-4 z-[1000]">
        <div className="max-w-md mx-auto bg-black text-white rounded-xl shadow-lg px-5 py-4 flex justify-between items-center">
          <div>
            <p className="font-bold text-lg">{authUser?.name}</p>
            <p className="text-sm text-green-400">Online & Available</p>
          </div>
          <div className="h-4 w-4 bg-green-500 rounded-full animate-pulse"></div>
        </div>
      </div>

      <MapContainer center={position} zoom={14} style={{ height: "100%", width: "100%", zIndex: 10 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        {/* Driver's own car marker */}
        <Marker position={position}>
          <Popup>Your Vehicle</Popup>
        </Marker>

        {/* NEW: Show the Passenger and Destination on the Driver's map! */}
        {incomingRide && (
          <>
            <Marker position={[incomingRide.pickup.lat, incomingRide.pickup.lng]} icon={pickupIcon}>
              <Popup>Passenger Pickup</Popup>
            </Marker>
            <Marker position={[incomingRide.dropoff.lat, incomingRide.dropoff.lng]} icon={dropoffIcon}>
              <Popup>Destination</Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      {/* INCOMING RIDE OVERLAY */}
      {incomingRide && (
        <div className="absolute bottom-0 left-0 w-full p-4 z-[1000]">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-black p-6 animate-bounce">
            
            <div className="text-center mb-4">
              <span className="bg-black text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                New Request
              </span>
            </div>

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

            {/* NEW: Location summary block */}
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
              <button 
                onClick={handleDecline}
                className="w-1/3 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-200 transition-colors"
              >
                Decline
              </button>
              <button 
                onClick={handleAccept}
                disabled={isAccepting}
                className="w-2/3 bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-green-600 disabled:bg-gray-400 transition-colors"
              >
                {isAccepting ? 'Accepting...' : 'Accept Ride'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}