import React, { useCallback, useEffect, useState } from 'react';
import { WEBSOCKET_URL } from "../constants";
import { Trip, Driver, CarPackageSlug } from '../types';
import { ServerWsMessage, TripEvents, isValidWsMessage, isValidTripEvent, ClientWsMessage, BackendEndpoints } from '../contracts';
import { apiFetch } from '../lib/api';

interface useDriverConnectionProps {
  location: {
    latitude: number;
    longitude: number;
  };
  geohash: string;
  userID: string;
  packageSlug: CarPackageSlug;
}

export const useDriverStreamConnection = ({
  location,
  geohash,
  userID,
  packageSlug
}: useDriverConnectionProps) => {
  const [requestedTrip, setRequestedTrip] = useState<Trip | null>(null)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [pendingCarpoolRequests, setPendingCarpoolRequests] = useState<Trip[]>([]);
  const [triedDriverIdsMap, setTriedDriverIdsMap] = useState<Record<string, string[]>>({});
  const [tripStatus, setTripStatus] = useState<TripEvents | null>(null);
  const [paidTripIds, setPaidTripIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  // Ref to always read the latest activeTrip status inside the WS callback
  const activeTripRef = React.useRef<Trip | null>(null);
  React.useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);
  const driverRef = React.useRef<Driver | null>(null);
  React.useEffect(() => { driverRef.current = driver; }, [driver]);

  const clearPaidTripMarkers = useCallback(() => setPaidTripIds([]), []);

  const restoreSeatsAfterTrip = useCallback((trip: Trip) => {
    setDriver((prev: Driver | null) => {
      if (!prev) return prev;
      const ids = prev.activeTripIds ?? [];
      if (!ids.includes(trip.id)) return prev;
      const remainingTripIds = ids.filter((id) => id !== trip.id);
      if (trip.selectedFare?.packageSlug === CarPackageSlug.CARPOOL) {
        const seatsReleased = trip.selectedFare?.requestedSeats ?? 1;
        const nextSeats = (prev.availableSeats ?? 0) + seatsReleased;
        return {
          ...prev,
          availableSeats: prev.capacity !== undefined ? Math.min(prev.capacity, nextSeats) : nextSeats,
          activeTripIds: remainingTripIds,
        };
      }
      return {
        ...prev,
        availableSeats: prev.capacity ?? prev.availableSeats,
        activeTripIds: remainingTripIds,
      };
    });
  }, []);

  /** Process Stripe payment-success WS events one at a time (carpool may fire back-to-back). */
  const [paidTripProcessQueue, setPaidTripProcessQueue] = useState<string[]>([]);

  useEffect(() => {
    if (paidTripProcessQueue.length === 0) return;
    const tripID = paidTripProcessQueue[0];
    let cancelled = false;
    void (async () => {
      try {
        const path = BackendEndpoints.GET_TRIP.replace("{id}", tripID);
        const res = await apiFetch(path);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const data = body.data;
        if (!data?.id || cancelled) return;
        restoreSeatsAfterTrip(data as Trip);
        setActiveTrip((prev) => (prev?.id === tripID ? null : prev));
      } catch (e) {
        console.error("driver ws: payment success handling", e);
      } finally {
        if (!cancelled) {
          setPaidTripProcessQueue((q) => q.slice(1));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paidTripProcessQueue, restoreSeatsAfterTrip]);

  useEffect(() => {
    if (ws?.readyState === WebSocket.OPEN && location && geohash) {
      ws.send(JSON.stringify({
        type: TripEvents.DriverLocation,
        data: {
          location,
          geohash,
        }
      }));
    }
  }, [location, geohash, ws]);

  useEffect(() => {
    if (!userID) return;

    const websocket = new WebSocket(`${WEBSOCKET_URL}${BackendEndpoints.WS_DRIVERS}?userID=${userID}&packageSlug=${packageSlug}`);
    setWs(websocket);

    websocket.onopen = () => {
      if (location) {
        // Send initial location
        websocket.send(JSON.stringify({
          type: TripEvents.DriverLocation,
          data: {
            location,
            geohash,
          }
        }));
      }
    };

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerWsMessage;

      if (!message || !isValidWsMessage(message)) {
        setError(`Unknown message type "${message}", allowed types are: ${Object.values(TripEvents).join(', ')}`);
        return;
      }

      switch (message.type) {
        case TripEvents.DriverTripRequest: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = message.data as any;
          const trip = payload.trip ?? payload;
          if (payload.triedDriverIds) {
            setTriedDriverIdsMap((prev: Record<string, string[]>) => ({ ...prev, [trip.id]: payload.triedDriverIds }));
          }
          if (activeTripRef.current || (driverRef.current?.activeTripIds?.length ?? 0) > 0) {
            setPendingCarpoolRequests((prev: Trip[]) =>
              prev.some((existing) => existing.id === trip.id) ? prev : [...prev, trip]
            );
          } else {
            setRequestedTrip(trip);
          }
          break;
        }
        case TripEvents.DriverRegister:
          setDriver(message.data);
          break;
        case TripEvents.PaymentSuccess: {
          const raw = message.data as { tripID?: string };
          const tid = raw?.tripID;
          if (tid) {
            setPaidTripIds((p) => (p.includes(tid) ? p : [...p, tid]));
            setPaidTripProcessQueue((q) => (q.includes(tid) ? q : [...q, tid]));
          }
          break;
        }
      }

      if (isValidTripEvent(message.type)) {
        if (message.type !== TripEvents.PaymentSuccess) {
          setTripStatus(message.type);
        }
      } else {
        setError(`Unknown message type "${message.type}", allowed types are: ${Object.values(TripEvents).join(', ')}`);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket closed');
    };

    websocket.onerror = (event) => {
      setError('WebSocket error occurred');
      console.error('WebSocket error:', event);
    };

    return () => {
      console.log('Closing WebSocket');
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [userID, packageSlug]);

  const sendMessage = (message: ClientWsMessage) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      setError('WebSocket is not connected');
    }
  };

  const resetTripStatus = () => {
    setTripStatus(null);
    setRequestedTrip(null);
    setActiveTrip(null);
    setPendingCarpoolRequests([]);
    setPaidTripIds([]);
    setPaidTripProcessQueue([]);
  }

  const acceptPendingRequest = (trip: Trip) => {
    if (!driver) return;
    sendMessage({
      type: TripEvents.DriverTripAccept,
      data: { tripID: trip.id, riderID: trip.userID, driver },
    });
    setPendingCarpoolRequests((prev: Trip[]) => prev.filter((t) => t.id !== trip.id));
    if (trip.selectedFare?.packageSlug === CarPackageSlug.CARPOOL) {
      patchDriverSeats(trip.selectedFare?.requestedSeats ?? 1);
    }
  };

  const declinePendingRequest = (trip: Trip) => {
    if (!driver) return;
    sendMessage({
      type: TripEvents.DriverTripDecline,
      data: { tripID: trip.id, riderID: trip.userID, driver, triedDriverIds: triedDriverIdsMap[trip.id] || [] },
    });
    setPendingCarpoolRequests((prev: Trip[]) => prev.filter((t) => t.id !== trip.id));
  };

  const patchDriverSeats = (delta: number) => {
    setDriver((prev: Driver | null) => {
      if (!prev || prev.availableSeats === undefined) return prev;
      return { ...prev, availableSeats: Math.max(0, prev.availableSeats - delta) };
    });
  };

  const reserveSeatsForAcceptedTrip = (trip: Trip) => {
    setDriver((prev: Driver | null) => {
      if (!prev || prev.availableSeats === undefined) return prev;
      const nextTripIds = [...(prev.activeTripIds ?? [])];
      if (!nextTripIds.includes(trip.id)) {
        nextTripIds.push(trip.id);
      }
      if (trip.selectedFare?.packageSlug === CarPackageSlug.CARPOOL) {
        const seatsNeeded = trip.selectedFare?.requestedSeats ?? 1;
        return { ...prev, availableSeats: Math.max(0, prev.availableSeats - seatsNeeded), activeTripIds: nextTripIds };
      }
      return { ...prev, availableSeats: 0, activeTripIds: nextTripIds };
    });
  };

  return { error, tripStatus, driver, requestedTrip, activeTrip, pendingCarpoolRequests, paidTripIds, clearPaidTripMarkers, resetTripStatus, sendMessage, setTripStatus, setActiveTrip, patchDriverSeats, reserveSeatsForAcceptedTrip, restoreSeatsAfterTrip, acceptPendingRequest, declinePendingRequest, triedDriverIdsMap };
}
