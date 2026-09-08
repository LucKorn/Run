import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, ScrollView, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

export default function App() {
  const [currentTab, setCurrentTab] = useState('workout');
  const [location, setLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isPaused, setIsPaused] = useState(true);
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [elevationGain, setElevationGain] = useState(0);
  const [workoutFinished, setWorkoutFinished] = useState(false);
  const [statusMsg, setStatusMsg] = useState('PRONTO');

  const [history, setHistory] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);

  const startTimeRef = useRef(null);
  const accumulatedTimeRef = useRef(0);
  const lastAltitudeRef = useRef(null);

  useEffect(() => {
    let locationSubscription;

    const startLocationUpdates = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setStatusMsg('SEM PERMISSÃO GPS');
        return;
      }

      setStatusMsg('EM ANDAMENTO');

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 3,
        },
        (newLocation) => {
          const { latitude, longitude, altitude } = newLocation.coords;
          const currentAlt = altitude !== null && altitude !== undefined ? Math.round(altitude) : 0;
          const newCoords = { latitude, longitude, altitude: currentAlt };

          if (altitude !== null && altitude !== undefined) {
            if (lastAltitudeRef.current !== null && altitude > lastAltitudeRef.current) {
              const altDiff = altitude - lastAltitudeRef.current;
              if (altDiff > 0.5) {
                setElevationGain((e) => e + altDiff);
              }
            }
            lastAltitudeRef.current = altitude;
          }

          setLocation(newCoords);

          setRouteCoordinates((prev) => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              const addedDist = calculateDistance(
                last.latitude,
                last.longitude,
                latitude,
                longitude
              );
              setDistance((d) => d + addedDist);
            }
            return [...prev, newCoords];
          });
        }
      );
    };

    if (!isPaused && !workoutFinished) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      startLocationUpdates();
    } else if (isPaused && !workoutFinished && duration > 0) {
      setStatusMsg('PAUSADO');
      if (startTimeRef.current) {
        accumulatedTimeRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
        startTimeRef.current = null;
      }
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isPaused, workoutFinished]);

  useEffect(() => {
    let timer;
    if (!isPaused && !workoutFinished) {
      timer = setInterval(() => {
        if (startTimeRef.current) {
          const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setDuration(accumulatedTimeRef.current + currentElapsed);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPaused, workoutFinished]);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const getPace = () => {
    if (distance <= 0.001 || duration === 0) return "0'00\"";
    const totalMinutes = duration / 60;
    const paceDecimal = totalMinutes / distance;
    const paceMins = Math.floor(paceDecimal);
    const paceSecs = Math.round((paceDecimal - paceMins) * 60);
    return `${paceMins}'${paceSecs < 10 ? '0' : ''}${paceSecs}"`;
  };

  const formatTime = (secs) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remainingSecs = secs % 60;
    return `${hrs > 0 ? `${hrs}:` : ''}${mins < 10 ? '0' : ''}${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const fetchTemperature = async (lat, lng) => {
    try {
      if (!lat || !lng) return '--°C';
      const response = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&current_weather=true'
      );
      const data = await response.json();
      if (data && data.current_weather) {
        return Math.round(data.current_weather.temperature) + '°C';
      }
      return '--°C';
    } catch (e) {
      return '--°C';
    }
  };

  const finishWorkout = async () => {
    setIsPaused(true);
    setWorkoutFinished(true);

    let tempString = '--°C';
    if (location) {
      tempString = await fetchTemperature(location.latitude, location.longitude);
    }

    const now = new Date();
    const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    const newWorkoutItem = {
      id: Date.now().toString(),
      monthYear: monthName,
      timestamp: now.getTime(),
      date: now.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      distance: distance.toFixed(2),
      duration: formatTime(duration),
      pace: getPace(),
      elevation: Math.round(elevationGain),
      calories: (distance * 65).toFixed(0),
      temperature: tempString,
      route: [...routeCoordinates]
    };

    setHistory((prev) => [newWorkoutItem, ...prev]);
  };

  const resetWorkout = () => {
    setDistance(0);
    setDuration(0);
    setElevationGain(0);
    lastAltitudeRef.current = null;
    setRouteCoordinates([]);
    setLocation(null);
    setWorkoutFinished(false);
    setIsPaused(true);
    setStatusMsg('PRONTO');
    startTimeRef.current = null;
    accumulatedTimeRef.current = 0;
  };

  const deleteWorkout = (id) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    setSelectedWorkout(null);
  };

  const getSelectedMonthName = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + selectedMonthOffset);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
  };

  const getFilteredHistory = () => {
    const currentMonthLabel = getSelectedMonthName();
    return history.filter((item) => item.monthYear === currentMonthLabel);
  };

  const getMapHtml = (coords) => {
    const defaultLat = coords && coords.length > 0 ? coords[0].latitude : (location ? location.latitude : -29.6872);
    const defaultLng = coords && coords.length > 0 ? coords[0].longitude : (location ? location.longitude : -51.1306);
    const polylineArray = JSON.stringify((coords || []).map(function(c) { return [c.latitude, c.longitude]; }));

    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>body,html,#map{margin:0;padding:0;height:100%;width:100%;background:#090A0F}.leaflet-control-attribution{display:none!important}</style></head><body><div id="map"></div><script>var map=L.map('map',{zoomControl:false}).setView([${defaultLat},${defaultLng}],16);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);var latlngs=${polylineArray};if(latlngs&&latlngs.length>0){var polyline=L.polyline(latlngs,{color:'#00D26A',weight:6}).addTo(map);map.fitBounds(polyline.getBounds(),{padding:[40,40]});}else{L.circleMarker([${defaultLat},${defaultLng}],{color:'#FFFFFF',fillColor:'#00D26A',fillOpacity:1,radius:7,weight:2}).addTo(map);}</script></body></html>`;
  };

  const getElevationChartHtml = (coords) => {
    const altitudes = (coords || []).map(function(c) { return c.altitude || 0; });
    const altArray = JSON.stringify(altitudes.length > 0 ? altitudes : [0, 0]);

    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/><style>body,html{margin:0;padding:0;height:100%;width:100%;background:transparent;display:flex;justify-content:center;align-items:center}canvas{width:95%;height:85%}</style></head><body><canvas id="chart"></canvas><script>var data=${altArray};var canvas=document.getElementById('chart');var ctx=canvas.getContext('2d');canvas.width=canvas.offsetWidth*2;canvas.height=canvas.offsetHeight*2;var min=Math.min.apply(null,data);var max=Math.max.apply(null,data);var range=(max-min)||1;var padding=20;var width=canvas.width-(padding*2);var height=canvas.height-(padding*2);ctx.beginPath();ctx.strokeStyle='#00D26A';ctx.lineWidth=4;for(var i=0;i<data.length;i++){var x=padding+(i/((data.length-1)||1))*width;var y=canvas.height-padding-((data[i]-min)/range)*height;if(i===0){ctx.moveTo(x,y);}else{ctx.lineTo(x,y);}}ctx.stroke();ctx.lineTo(padding+width,canvas.height-padding);ctx.lineTo(padding,canvas.height-padding);ctx.closePath();var gradient=ctx.createLinearGradient(0,0,0,canvas.height);gradient.addColorStop(0,'rgba(0,210,106,0.35)');gradient.addColorStop(1,'rgba(0,210,106,0.0)');ctx.fillStyle=gradient;ctx.fill();</script></body></html>`;
  };

  const filteredWorkouts = getFilteredHistory();
  const totalMonthKm = filteredWorkouts.reduce((sum, item) => sum + parseFloat(item.distance), 0).toFixed(2);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.appTitle}>
          RUNNER<Text style={styles.appTitleAccent}>GO</Text>
        </Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, currentTab === 'workout' && styles.tabButtonActive]}
            onPress={() => setCurrentTab('workout')}
          >
            <Text style={[styles.tabText, currentTab === 'workout' && styles.tabTextActive]}>🏃‍♂️ NOVO TREINO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, currentTab === 'history' && styles.tabButtonActive]}
            onPress={() => setCurrentTab('history')}
          >
            <Text style={[styles.tabText, currentTab === 'history' && styles.tabTextActive]}>
              📋 HISTÓRICO ({history.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {currentTab === 'history' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={() => setSelectedMonthOffset((prev) => prev - 1)}>
              <Text style={styles.monthNavArrow}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>📅 {getSelectedMonthName()}</Text>
            <TouchableOpacity onPress={() => setSelectedMonthOffset((prev) => prev + 1)}>
              <Text style={styles.monthNavArrow}>▶</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.monthTotalBadge}>
            <Text style={styles.monthTotalKmText}>TOTAL DO MÊS: {totalMonthKm} KM</Text>
          </View>

          {filteredWorkouts.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyText}>Nenhum treino neste mês.</Text>
            </View>
          ) : (
            filteredWorkouts.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.historyCard}
                onPress={() => setSelectedWorkout(item)}
                activeOpacity={0.7}
              >
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>🗓️ {item.date} {item.temperature ? `• 🌤️ ${item.temperature}` : ''}</Text>
                  <Text style={styles.historyDistance}>{item.distance} KM ➔</Text>
                </View>
                <View style={styles.historyStatsRow}>
                  <View style={styles.historyStatItem}>
                    <Text style={styles.historyStatValue}>{item.duration}</Text>
                    <Text style={styles.historyStatLabel}>TEMPO</Text>
                  </View>
                  <View style={styles.historyStatItem}>
                    <Text style={styles.historyStatValue}>{item.pace}</Text>
                    <Text style={styles.historyStatLabel}>PACE</Text>
                  </View>
                  <View style={styles.historyStatItem}>
                    <Text style={styles.historyStatValue}>{item.elevation} m</Text>
                    <Text style={styles.historyStatLabel}>ELEVAÇÃO</Text>
                  </View>
                  <View style={styles.historyStatItem}>
                    <Text style={styles.historyStatValue}>{item.calories} kcal</Text>
                    <Text style={styles.historyStatLabel}>CALORIAS</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {workoutFinished ? (
            <View style={styles.fullScreenSummaryContainer}>
              <WebView
                originWhitelist={['*']}
                source={{ html: getMapHtml(routeCoordinates) }}
                style={StyleSheet.absoluteFillObject}
                scrollEnabled={false}
              />
              <View style={styles.glassOverlay}>
                <ScrollView contentContainerStyle={styles.glassScrollContent} showsVerticalScrollIndicator={false}>
                  <Text style={styles.summaryHeader}>TREINO CONCLUÍDO! 🥇</Text>
                  <Text style={styles.summarySubHeader}>Treino salvo automaticamente no seu histórico.</Text>

                  <Text style={styles.glassSectionLabel}>📈 PERFIL DE ELEVAÇÃO</Text>
                  <View style={styles.glassChartContainer}>
                    <WebView
                      originWhitelist={['*']}
                      source={{ html: getElevationChartHtml(routeCoordinates) }}
                      style={styles.map}
                      scrollEnabled={false}
                    />
                  </View>

                  <View style={styles.statsGrid}>
                    <View style={styles.glassStatCard}>
                      <Text style={styles.statCardValue}>{distance.toFixed(2)}</Text>
                      <Text style={styles.statCardLabel}>DISTÂNCIA (KM)</Text>
                    </View>
                    <View style={styles.glassStatCard}>
                      <Text style={styles.statCardValue}>{formatTime(duration)}</Text>
                      <Text style={styles.statCardLabel}>DURAÇÃO</Text>
                    </View>
                    <View style={styles.glassStatCard}>
                      <Text style={styles.statCardValue}>{getPace()}</Text>
                      <Text style={styles.statCardLabel}>PACE (MIN/KM)</Text>
                    </View>
                    <View style={styles.glassStatCard}>
                      <Text style={styles.statCardValue}>{Math.round(elevationGain)} m</Text>
                      <Text style={styles.statCardLabel}>GANHO ELEVAÇÃO</Text>
                    </View>
                    <View style={styles.glassStatCard}>
                      <Text style={styles.statCardValue}>{(distance * 65).toFixed(0)}</Text>
                      <Text style={styles.statCardLabel}>CALORIAS (KCAL)</Text>
                    </View>
                    <View style={styles.glassStatCard}>
                      <Text style={styles.statCardValue}>{history[0]?.temperature || '--°C'}</Text>
                      <Text style={styles.statCardLabel}>TEMPERATURA</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.saveButton} onPress={resetWorkout}>
                    <Text style={styles.saveButtonText}>INICIAR NOVO TREINO</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.badgeContainer}>
                <View style={[styles.statusBadge, !isPaused && styles.statusBadgeActive]}>
                  <Text style={styles.statusBadgeText}>{statusMsg}</Text>
                </View>
              </View>

              <View style={styles.mainDisplay}>
                <Text style={styles.mainValue}>{distance.toFixed(2)}</Text>
                <Text style={styles.mainLabel}>QUILÔMETROS</Text>
              </View>

              <View style={styles.cardsRow}>
                <View style={styles.card}>
                  <Text style={styles.cardValue}>{formatTime(duration)}</Text>
                  <Text style={styles.cardLabel}>TEMPO</Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardValue}>{getPace()}</Text>
                  <Text style={styles.cardLabel}>PACE (MIN/KM)</Text>
                </View>
              </View>

              <View style={styles.cardsRow}>
                <View style={styles.card}>
                  <Text style={styles.cardValue}>{Math.round(elevationGain)} m</Text>
                  <Text style={styles.cardLabel}>GANHO ELEVAÇÃO</Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardValue}>{(distance * 65).toFixed(0)}</Text>
                  <Text style={styles.cardLabel}>KCAL ESTIMADAS</Text>
                </View>
              </View>

              <View style={styles.actionContainer}>
                <TouchableOpacity
                  style={[styles.primaryButton, isPaused ? styles.startButton : styles.pauseButton]}
                  onPress={() => setIsPaused(!isPaused)}
                >
                  <Text style={styles.buttonText}>{isPaused ? 'INICIAR TREINO' : 'PAUSAR'}</Text>
                </TouchableOpacity>

                {duration > 0 && (
                  <TouchableOpacity style={styles.stopButton} onPress={finishWorkout}>
                    <Text style={styles.buttonText}>FINALIZAR E SALVAR</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      <Modal
        visible={selectedWorkout !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedWorkout(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedWorkout && (
            <WebView
              originWhitelist={['*']}
              source={{ html: getMapHtml(selectedWorkout.route) }}
              style={StyleSheet.absoluteFillObject}
              scrollEnabled={false}
            />
          )}
          <View style={styles.glassOverlay}>
            <ScrollView contentContainerStyle={styles.glassScrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>DETALHES DO TREINO</Text>
              <Text style={styles.modalDate}>
                {selectedWorkout?.date} {selectedWorkout?.temperature ? `• 🌤️ ${selectedWorkout.temperature}` : ''}
              </Text>

              <Text style={styles.glassSectionLabel}>📈 PERFIL DE ELEVAÇÃO</Text>
              <View style={styles.glassChartContainer}>
                {selectedWorkout && (
                  <WebView
                    originWhitelist={['*']}
                    source={{ html: getElevationChartHtml(selectedWorkout.route) }}
                    style={styles.map}
                    scrollEnabled={false}
                  />
                )}
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.glassStatCard}>
                  <Text style={styles.statCardValue}>{selectedWorkout?.distance}</Text>
                  <Text style={styles.statCardLabel}>DISTÂNCIA (KM)</Text>
                </View>
                <View style={styles.glassStatCard}>
                  <Text style={styles.statCardValue}>{selectedWorkout?.duration}</Text>
                  <Text style={styles.statCardLabel}>DURAÇÃO</Text>
                </View>
                <View style={styles.glassStatCard}>
                  <Text style={styles.statCardValue}>{selectedWorkout?.pace}</Text>
                  <Text style={styles.statCardLabel}>PACE (MIN/KM)</Text>
                </View>
                <View style={styles.glassStatCard}>
                  <Text style={styles.statCardValue}>{selectedWorkout?.elevation} m</Text>
                  <Text style={styles.statCardLabel}>GANHO ELEVAÇÃO</Text>
                </View>
                <View style={styles.glassStatCard}>
                  <Text style={styles.statCardValue}>{selectedWorkout?.calories}</Text>
                  <Text style={styles.statCardLabel}>CALORIAS (KCAL)</Text>
                </View>
                <View style={styles.glassStatCard}>
                  <Text style={styles.statCardValue}>{selectedWorkout?.temperature || '--°C'}</Text>
                  <Text style={styles.statCardLabel}>TEMPERATURA</Text>
                </View>
              </View>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteWorkout(selectedWorkout?.id)}
                >
                  <Text style={styles.deleteButtonText}>EXCLUIR TREINO</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedWorkout(null)}>
                  <Text style={styles.closeButtonText}>FECHAR</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090A0F' },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 40 },
  headerContainer: {
    alignItems: 'center',
    paddingTop: 12,
    backgroundColor: '#13151C',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E222D',
  },
  appTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  appTitleAccent: { color: '#00D26A' },
  tabContainer: {
    flexDirection: 'row',
    marginTop: 10,
    backgroundColor: '#090A0F',
    borderRadius: 20,
    padding: 3,
    gap: 4,
  },
  tabButton: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16 },
  tabButtonActive: { backgroundColor: '#00D26A' },
  tabText: { color: '#6C727F', fontSize: 10, fontWeight: '800' },
  tabTextActive: { color: '#FFFFFF' },

  badgeContainer: { alignItems: 'center', marginTop: 10, marginBottom: 10 },
  statusBadge: {
    backgroundColor: '#13151C',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E222D',
  },
  statusBadgeActive: { backgroundColor: '#00D26A20', borderColor: '#00D26A' },
  statusBadgeText: { color: '#00D26A', fontSize: 10, fontWeight: '800' },

  fullScreenSummaryContainer: { flex: 1, position: 'relative' },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 10, 15, 0.25)', // Película ultra leve para o mapa aparecer bem
  },
  glassScrollContent: { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 40 },
  glassSectionLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 12, marginBottom: 8, textShadowColor: '#000', textShadowRadius: 3 },
  glassChartContainer: {
    width: '100%',
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.22)', // Fundo claro e translúcido
  },
  map: { width: '100%', height: '100%', backgroundColor: 'transparent' },

  mainDisplay: { alignItems: 'center', marginVertical: 20 },
  mainValue: { color: '#FFFFFF', fontSize: 72, fontWeight: '900', letterSpacing: -2 },
  mainLabel: { color: '#6C727F', fontSize: 13, fontWeight: '700', letterSpacing: 2 },

  cardsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  card: {
    flex: 1,
    backgroundColor: '#13151C',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E222D',
  },
  cardValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  cardLabel: { color: '#6C727F', fontSize: 9, fontWeight: '700', marginTop: 4 },

  actionContainer: { marginTop: 20, gap: 10 },
  primaryButton: { paddingVertical: 18, borderRadius: 30, alignItems: 'center' },
  startButton: { backgroundColor: '#00D26A' },
  pauseButton: { backgroundColor: '#FF9F0A' },
  stopButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 1 },

  summaryHeader: { color: '#00D26A', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 8, textShadowColor: '#000', textShadowRadius: 4 },
  summarySubHeader: { color: '#FFFFFF', fontSize: 12, textAlign: 'center', marginBottom: 12, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 12 },
  
  // Cards Claros e Translúcidos com Vidro Real
  glassStatCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  statCardValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 2 },
  statCardLabel: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', marginTop: 4, letterSpacing: 0.5, textShadowColor: '#000', textShadowRadius: 2 },
  
  saveButton: { backgroundColor: '#00D26A', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },

  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#13151C',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E222D',
  },
  monthTitle: { color: '#00D26A', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  monthNavArrow: { color: '#00D26A', fontSize: 16, fontWeight: '900', paddingHorizontal: 10 },
  monthTotalBadge: {
    alignItems: 'center',
    marginBottom: 12,
  },
  monthTotalKmText: { color: '#6C727F', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  emptyHistory: { alignItems: 'center', marginTop: 40, padding: 20 },
  emptyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  historyCard: {
    backgroundColor: '#13151C',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E222D',
    marginBottom: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1E222D',
    paddingBottom: 8,
    marginBottom: 10,
  },
  historyDate: { color: '#6C727F', fontSize: 12, fontWeight: '600' },
  historyDistance: { color: '#00D26A', fontSize: 16, fontWeight: '900' },
  historyStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  historyStatItem: { alignItems: 'center' },
  historyStatValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  historyStatLabel: { color: '#6C727F', fontSize: 8, marginTop: 2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: '#090A0F',
    position: 'relative',
  },
  modalTitle: { color: '#00D26A', fontSize: 20, fontWeight: '900', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 3 },
  modalDate: { color: '#FFFFFF', fontSize: 12, textAlign: 'center', marginBottom: 16, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
  },
  deleteButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  closeButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
  },
  closeButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
});
                      
