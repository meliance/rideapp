import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';

// --- SUB-COMPONENT: Expandable Trip Card ---
const TripCard = ({ trip, isDriver, formatDate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("Loading address...");
  const [dropoffAddress, setDropoffAddress] = useState("Loading address...");
  const [addressesFetched, setAddressesFetched] = useState(false);

  const displayPic = isDriver ? trip.passenger_pic : trip.driver_pic;
  const displayName = isDriver ? trip.passenger_name : trip.driver_name;
  const displayPhone = isDriver ? trip.passenger_phone : trip.driver_phone;

  // Lazy-load addresses only when the card is clicked to prevent API rate limits!
  useEffect(() => {
    if (isExpanded && !addressesFetched) {
      const fetchAddresses = async () => {
        try {
          const headers = { 'Accept-Language': 'en,am' };
          const osmBase = "https://nominatim.openstreetmap.org/reverse?format=json";
          const devEmail = "&email=developer@rideapp.com"; 

          const pickupRes = await fetch(`${osmBase}&lat=${trip.pickup_lat}&lon=${trip.pickup_lng}${devEmail}`, { headers });
          const pickupData = await pickupRes.json();
          setPickupAddress(pickupData.name || pickupData.display_name?.split(',')[0] || "Pinned Location");

          const dropoffRes = await fetch(`${osmBase}&lat=${trip.dropoff_lat}&lon=${trip.dropoff_lng}${devEmail}`, { headers });
          const dropoffData = await dropoffRes.json();
          setDropoffAddress(dropoffData.name || dropoffData.display_name?.split(',')[0] || "Pinned Location");
          
          setAddressesFetched(true);
        } catch (error) {
          setPickupAddress("Coordinates saved");
          setDropoffAddress("Coordinates saved");
        }
      };
      fetchAddresses();
    }
  }, [isExpanded, addressesFetched, trip]);

  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)} 
      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer overflow-hidden"
    >
      {/* Top Row: Date & Status */}
      <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
        <p className="text-sm font-semibold text-gray-500">{formatDate(trip.created_at)}</p>
        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
          ${trip.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 
            trip.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 
            'bg-blue-100 text-blue-700'}`}
        >
          {trip.status}
        </span>
      </div>

      {/* Middle Row: User Info & Price summary */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          {displayPic ? (
            <img src={displayPic} alt={displayName} className="w-14 h-14 rounded-full object-cover border-2 border-gray-100" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-gray-500 font-bold text-xl">{displayName?.charAt(0) || '?'}</span>
            </div>
          )}
          <div>
            <p className="font-bold text-lg text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-500">{displayPhone}</p>
          </div>
        </div>
        
        <div className="text-right">
          {/* FIX: Show 0 ETB if the trip was cancelled! */}
          <p className="font-black text-2xl text-gray-900">
            {trip.status === 'CANCELLED' ? '0' : trip.fare_estimation} ETB
          </p>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-1">Total Fare</p>
        </div>
      </div>

      {/* EXPANDED DETAILS VIEW */}
      {isExpanded && (
        <div className="mt-5 pt-5 border-t border-gray-100 animate-fade-in">
          
          {/* Beautiful Location UI */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-100">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-3 h-3 rounded-full bg-blue-500 mt-1 shadow-sm"></div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Pickup</p>
                <p className="font-semibold text-gray-900">{pickupAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500 mt-1 shadow-sm"></div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Dropoff</p>
                <p className="font-semibold text-gray-900">{dropoffAddress}</p>
              </div>
            </div>
          </div>

          {/* Extra Details: Vehicle info for passengers */}
          {!isDriver && trip.vehicle_make && (
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100 mt-2 mb-4">
              <span className="text-sm text-gray-500 font-bold uppercase">Vehicle</span>
              <span className="text-sm font-semibold text-gray-900">
                {trip.vehicle_make} {trip.vehicle_model} • {trip.license_plate}
              </span>
            </div>
          )}

          {/* Quick Map Action Buttons */}
          {/* <div className="flex gap-2">
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${trip.pickup_lat},${trip.pickup_lng}`} 
              target="_blank" rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()} 
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold py-3 rounded-lg text-center transition"
            >
              Map Pickup
            </a>
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${trip.dropoff_lat},${trip.dropoff_lng}`} 
              target="_blank" rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()} 
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold py-3 rounded-lg text-center transition"
            >
              Map Dropoff
            </a>
          </div> */}
        </div>
      )}
    </div>
  );
};

export default function TripHistory() {
  const { authUser } = useAuthStore();
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const isDriver = authUser?.activeRole === 'driver' || authUser?.role === 'driver';

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axiosInstance.get('/trips/history');
        setTrips(res.data.history || []);
      } catch (error) {
        console.error("Failed to fetch history", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const formatDate = (dateString) => {
    const options = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 flex-col">
        <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-black mb-4"></div>
        <h2 className="font-bold text-gray-700">Loading History...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-10">
      
      {/* HEADER */}
      <div className="max-w-2xl mx-auto flex items-center justify-between py-6 mb-4">
        <button 
          onClick={() => navigate('/')}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow hover:bg-gray-100 transition"
        >
          <span className="text-xl font-bold">←</span>
        </button>
        <h1 className="text-2xl font-black text-gray-900">Your Trips</h1>
        <div className="w-10"></div> 
      </div>

      {/* TRIP LIST */}
      <div className="max-w-2xl mx-auto space-y-4">
        {trips.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
            <p className="text-gray-500 font-medium text-lg">No trips found yet.</p>
            <p className="text-sm text-gray-400 mt-1">Time to hit the road!</p>
          </div>
        ) : (
          trips.map((trip) => (
            <TripCard 
              key={trip.trip_id} 
              trip={trip} 
              isDriver={isDriver} 
              formatDate={formatDate} 
            />
          ))
        )}
      </div>
    </div>
  );
}