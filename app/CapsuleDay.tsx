import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

export default function CapsuleDay() {
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tappedDate, setTappedDate] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [markedDates, setMarkedDates] = useState<any>({});

  const getFormattedDate = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString + 'T12:00:00Z');
      const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'long' };
      return date.toLocaleDateString(undefined, options);
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  useEffect(() => {
    (async () => {
      const { granted: cameraGranted } = await requestCameraPermission();
      if (!cameraGranted) {
        Alert.alert('Permission required', 'Camera permission is needed to take pictures.');
      }

      const mediaStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (mediaStatus.status !== 'granted') {
        Alert.alert('Permission required', 'Media library permission is needed to save images.');
      }

      await loadMarkedDates();
    })();
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedDate) {
      setImageUri(null);
      setText('');
      return;
    }
    try {
      const data = await AsyncStorage.getItem(`capsule-${selectedDate}`);
      if (data) {
        const parsed = JSON.parse(data);
        setImageUri(parsed.image);
        setText(parsed.text);
      } else {
        setImageUri(null);
        setText('');
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [selectedDate, loadData]);

  // Mark the date as having content
  const updateMarkedDates = useCallback(async (hasContent: boolean) => {
    try {
      if (!selectedDate) return;

      const data = await AsyncStorage.getItem('marked-dates');
      const existingDates = data ? JSON.parse(data) : {};

      if (hasContent) {
        existingDates[selectedDate] = {
          selected: true,
          marked: true,
          selectedColor: '#5cb85c',
        };
      } else {
        delete existingDates[selectedDate];
      }

      setMarkedDates(existingDates);
      await AsyncStorage.setItem('marked-dates', JSON.stringify(existingDates));
    } catch (e) {
      console.error('Failed to update marked dates:', e);
    }
  }, [selectedDate]);

  // Save data for selected date (debounced for text changes)
  const saveData = useCallback(async (img: string | null, txt: string) => {
    try {
      if (!selectedDate) return;

      const hasContent = !!img || (txt && txt.trim().length > 0);
      if (!hasContent) {
        await AsyncStorage.removeItem(`capsule-${selectedDate}`);
        await updateMarkedDates(false); // Pass false as there's no content
        return;
      }

      await AsyncStorage.setItem(
        `capsule-${selectedDate}`,
        JSON.stringify({ image: img, text: txt })
      );
      await updateMarkedDates(true); // Pass true as there is content
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }, [selectedDate, updateMarkedDates]);

  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      saveData(imageUri, text);
    }, 500);

    return () => clearTimeout(saveTimeout);
  }, [text, imageUri, saveData]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        // saveData is called by useEffect after setImageUri updates state
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open camera or pick image.');
      console.error('ImagePicker error:', e);
    }
  };

  const loadMarkedDates = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem('marked-dates');
      if (data) {
        setMarkedDates(JSON.parse(data));
      }
    } catch (e) {
      console.error('Failed to load marked dates:', e);
    }
  }, []);

  const clearDayData = async (showAlert: boolean = true) => {
    try {
      if (!selectedDate) return;

      await AsyncStorage.removeItem(`capsule-${selectedDate}`);

      // Now directly call updateMarkedDates with false because we've cleared the data
      await updateMarkedDates(false);

      setImageUri(null);
      setText('');
      if (showAlert) {
        Alert.alert('Cleared', 'The data for this day has been erased and unhighlighted!');
      }
    } catch (e) {
      console.error('Failed to clear data:', e);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar backgroundColor="#ffff33" barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerDateText}>
            {selectedDate ? getFormattedDate(selectedDate) : 'Select a Date'}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerIcon} onPress={pickImage}>
          <Svg height="28" width="28" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></Path>
            <Path d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></Path>
          </Svg>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.calendarContainer}>
            <Calendar
              current={selectedDate || new Date().toISOString().split('T')[0]}
              minDate="2020-01-01"
              onDayPress={(day) => {
                setSelectedDate(day.dateString);
                setTappedDate(day.dateString);
              }}
              markedDates={markedDates}
              monthFormat={'yyyy MM'}
              style={styles.calendar}
              theme={{
                backgroundColor: '#000',
                calendarBackground: '#000',
                textSectionTitleColor: '#fff',
                dayTextColor: '#fff',
                selectedDayBackgroundColor: '#5cb85c',
                selectedDayTextColor: '#fff',
                monthTextColor: '#fff',
                arrowColor: '#fff',
                textDisabledColor: '#444',
                textDayFontWeight: '500',
                textMonthFontFamily: 'bold',
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14,
              }}
            />
          </View>

          {selectedDate && (
            <>
              {imageUri && <Image source={{ uri: imageUri }} style={styles.image} />}

              <TextInput
                placeholder="Write about your day..."
                placeholderTextColor="#888"
                value={text}
                onChangeText={setText}
                multiline
                style={styles.input}
              />

              <TouchableOpacity style={styles.clearDataButton} onPress={() => clearDayData(true)}>
                <Text style={styles.clearDataButtonText}>Clear This Day's Data</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffff33',
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '100%',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerDateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  headerIcon: {
    padding: 8,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    backgroundColor: '#000',
    flexGrow: 1,
  },
  calendarContainer: {
    marginVertical: 20,
  },
  calendar: {
    backgroundColor: '#000',
    borderRadius: 10,
    padding: 10,
  },
  image: {
    width: '100%',
    height: 200,
    marginVertical: 10,
    borderRadius: 8,
  },
  input: {
    borderWidth: 1,
    backgroundColor: '#ffff33',
    borderColor: '#ffff33',
    padding: 10,
    minHeight: 100,
    textAlignVertical: 'top',
    borderRadius: 6,
    marginBottom: 10,
    color: '#000',
  },
  takePictureButton: {
    backgroundColor: '#ffff33',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  takePictureButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearDataButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearDataButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});