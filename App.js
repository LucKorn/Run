import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import * as Location from 'expo-location';

export default function App() {
  const [location, setLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isPaused, setIsPaused] = useState(true);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      let initialLoc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: initialLoc.coords.latitude,
        longitude: initialLoc.coords.longitude,
      };
      setLocation(coords);
      setRouteCoordinates([coords]);
    })();
  }, []);

  useEffect(() => {
    let subscription;
    if (!isPaused) {
      (async () => {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 3,
          },
          (newLocation) => {
            const newCoords = {
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude,
            };
            setLocation(newCoords);
            setRouteCoordinates((prev) => [...prev, newCoords]);
          }
        );
      })();
    }

    return () => subscription && subscription.remove();
  }, [isPaused]);

  useEffect(() => {
    let timer;
    if (!isPaused) {
      timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isPaused]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {location ? (
        <MapView
          style={styles.map}
          initialRegion={{
            ...location,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }}
          showsUserLocation
          followsUserLocation
        >
          <Polyline coordinates={routeCoordinates} strokeWidth={5} strokeColor="#007AFF" />
        </MapView>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Obtendo localização GPS...</Text>
        </View>
      )}

      <View style={styles.metricsContainer}>
        <View style={styles.metricRow}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricValue}>{formatTime(duration)}</Text>
            <Text style={styles.metricLabel}>TEMPO</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, isPaused ? styles.startButton : styles.pauseButton]}
          onPress={() => setIsPaused(!isPaused)}
        >
          <Text style={styles.buttonText}>{isPaused ? 'INICIAR' : 'PAUSAR'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFF' },
  metricsContainer: {
    backgroundColor: '#1C1C1E',
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  metricRow: { alignItems: 'center', marginBottom: 16 },
  metricBlock: { alignItems: 'center' },
  metricValue: { color: '#FFF', fontSize: 40, fontWeight: 'bold' },
  metricLabel: { color: '#8E8E93', fontSize: 12, marginTop: 4, fontWeight: '600' },
  button: {
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  startButton: { backgroundColor: '#34C759' },
  pauseButton: { backgroundColor: '#FF9500' },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
});
