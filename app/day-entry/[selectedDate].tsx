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
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router'; // useLocalSearchParams for dynamic routes
import Svg, { Path } from 'react-native-svg';
import * as NavigationBar from 'expo-navigation-bar'; // For Android Navigation Bar

// AsyncStorage key for storing dates with content
const DATES_WITH_CONTENT_KEY = 'dates_with_content';

export default function DayEntryScreen() {
  const router = useRouter();
  // useLocalSearchParams will automatically pick up 'selectedDate' from the dynamic route `[selectedDate].tsx`
  const params = useLocalSearchParams();
  const { selectedDate } = params; // This will receive the date from index.tsx

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false); // Local saved indicator

  const pan = useState(new Animated.ValueXY({ x: 0, y: 0 }))[0];

  const getFormattedDate = (dateString: string | string[] | undefined) => {
    if (!dateString || typeof dateString !== 'string') return 'Loading Date...';
    try {
      const date = new Date(dateString + 'T12:00:00Z'); // Adding T12:00:00Z to avoid timezone issues
      const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'long' };
      return date.toLocaleDateString(undefined, options);
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  // Helper to update the list of dates with content
  const updateDatesWithContent = async (date: string, hasContent: boolean) => {
    try {
      const existingData = await AsyncStorage.getItem(DATES_WITH_CONTENT_KEY);
      let dates: string[] = existingData ? JSON.parse(existingData) : [];

      if (hasContent && !dates.includes(date)) {
        dates.push(date);
      } else if (!hasContent && dates.includes(date)) {
        dates = dates.filter(d => d !== date);
      }
      await AsyncStorage.setItem(DATES_WITH_CONTENT_KEY, JSON.stringify(dates));
    } catch (e) {
      console.error('Failed to update dates with content:', e);
    }
  };

  const loadData = useCallback(async () => {
    if (!selectedDate || typeof selectedDate !== 'string') return;
    try {
      const data = await AsyncStorage.getItem(`capsule-${selectedDate}`);
      if (data) {
        const parsed = JSON.parse(data);
        setImageUri(parsed.image);
        setText(parsed.text);
        setMood(parsed.mood || null);
      } else {
        setImageUri(null);
        setText('');
        setMood(null);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }, [selectedDate]);

  const saveData = useCallback(async (img: string | null, txt: string, currentMood: string | null) => {
    if (!selectedDate || typeof selectedDate !== 'string') return;

    const hasContent = !!img || (txt && txt.trim().length > 0) || !!currentMood;

    try {
      if (hasContent) {
        await AsyncStorage.setItem(
          `capsule-${selectedDate}`,
          JSON.stringify({ image: img, text: txt, mood: currentMood })
        );
        await updateDatesWithContent(selectedDate, true); // Mark this date as having content

        // Show local saved indicator
        setShowSavedIndicator(true);
        setTimeout(() => setShowSavedIndicator(false), 2000);

      } else {
        await AsyncStorage.removeItem(`capsule-${selectedDate}`);
        await updateDatesWithContent(selectedDate, false); // Unmark this date
      }
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }, [selectedDate]);

  useEffect(() => {
    // Only load data when selectedDate changes or on initial mount
    if (selectedDate) {
      loadData();
    }
  }, [selectedDate, loadData]);

  // Auto-save effect
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      saveData(imageUri, text, mood);
    }, 500);

    return () => clearTimeout(saveTimeout);
  }, [text, imageUri, mood, saveData]);

  // === NEW EFFECT FOR ANDROID NAVIGATION BAR COLOR ===
  useEffect(() => {
    let originalNavBarColor: string | null = null;
    let originalNavBarButtonStyle: 'light' | 'dark' | null = null;

    const setAppNavigationBar = async () => {
      if (Platform.OS === 'android') {
        try {
          // Get current state to restore later
          originalNavBarColor = await NavigationBar.getBackgroundColorAsync();
          originalNavBarButtonStyle = await NavigationBar.getButtonStyleAsync();

          // Set the navigation bar for this screen to match its background
          await NavigationBar.setBackgroundColorAsync('black');
          await NavigationBar.setButtonStyleAsync('light'); // Set light icons for contrast
        } catch (error) {
          console.warn('Failed to set navigation bar color/style in DayEntryScreen:', error);
        }
      }
    };

    const restoreNavigationBar = async () => {
      if (Platform.OS === 'android') {
        try {
          // Restore to previous state when component unmounts
          if (originalNavBarColor) {
            await NavigationBar.setBackgroundColorAsync(originalNavBarColor);
          }
          if (originalNavBarButtonStyle) {
            await NavigationBar.setButtonStyleAsync(originalNavBarButtonStyle);
          }
        } catch (error) {
          console.warn('Failed to restore navigation bar color/style in DayEntryScreen:', error);
        }
      }
    };

    setAppNavigationBar(); // Call on mount

    return () => {
      restoreNavigationBar(); // Call on unmount
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount


  const pickImage = async () => {
    try {
      // 1. Request Camera Permissions
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();

      if (cameraStatus !== 'granted') {
        Alert.alert(
          'Camera Access Required',
          'NotePix needs camera access to take photos. Please grant permission in your device settings to use this feature.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        console.log("Camera permission denied.");
        return;
      }

      // 2. Request Media Library Permissions (for saving the image)
      const { status: mediaLibraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (mediaLibraryStatus !== 'granted') {
        Alert.alert(
          'Photo Library Access Required',
          'NotePix needs access to your photo library to save images. Please grant permission in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        console.log("Media library permission denied.");
        return;
      }

      // 3. Launch Camera if both permissions are granted
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
      } else {
        console.log('Photo taking cancelled or no asset captured.');
      }
    } catch (e: any) {
      if (e.message.includes('User rejected permissions')) {
        console.warn('ImagePicker error: User explicitly rejected permissions. (Handled by Alert)', e);
      } else {
        console.error('An unexpected ImagePicker error occurred:', e);
        Alert.alert('Error', 'Could not open camera or pick image. Please try again.');
      }
    }
  };

  const clearDayData = async () => {
    if (!selectedDate || typeof selectedDate !== 'string') return;
    Alert.alert(
      "Clear Day Data",
      "Are you sure you want to erase all data for this day?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Erase",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(`capsule-${selectedDate}`);
              await updateDatesWithContent(selectedDate, false); // Unmark this date
              setImageUri(null);
              setText('');
              setMood(null);
              Alert.alert('Cleared', 'The data for this day has been erased!');
            } catch (e) {
              console.error('Failed to clear data:', e);
              Alert.alert('Error', 'Failed to clear data.');
            }
          },
          style: "destructive"
        }
      ],
      { cancelable: true }
    );
  };

  const panResponder = useState(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          pan.setValue({ x: 0, y: gestureState.dy });
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 100) { // If swiped down more than 100 pixels
          router.back(); // Navigate back to the calendar screen
        } else {
          Animated.spring(
            pan,
            { toValue: { x: 0, y: 0 }, useNativeDriver: true }
          ).start();
        }
      },
    })
  )[0];

  const moods = ['😊', '😐', '🙁', '😡', '😴', '🥳'];

  return (
    // SafeAreaView handles padding for notches/dynamic island.
    // The background color will match your app's dark theme.
    <View style={styles.fullScreenContainer}>
      {/* StatusBar is now managed globally in _layout.tsx */}

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          style={[styles.animatedContent, { transform: [{ translateY: pan.y }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.swipeIndicatorContainer}>
            <View style={styles.swipeIndicator} />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoDateText}>
              {getFormattedDate(selectedDate)}
            </Text>
            <View style={styles.infoIconsContainer}>
              <TouchableOpacity style={styles.infoIcon} onPress={pickImage}>
                <Svg height="24" width="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></Path>
                  <Path d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></Path>
                </Svg>
              </TouchableOpacity>
              <TouchableOpacity style={styles.infoIcon} onPress={clearDayData}>
                <Svg height="24" width="24" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M3 6h18"></Path>
                  <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></Path>
                  <Path d="M10 11v6"></Path>
                  <Path d="M14 11v6"></Path>
                </Svg>
              </TouchableOpacity>
            </View>
          </View>

          {showSavedIndicator && (
            <Animated.View
              style={[
                styles.savedIndicatorContainer,
                {
                  opacity: new Animated.Value(1).interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ]}
            >
              <Text style={styles.savedIndicatorText}>Saved! ✅</Text>
            </Animated.View>
          )}

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.image} />
            ) : (
              <TouchableOpacity style={styles.imagePlaceholder} onPress={pickImage}>
                <Svg height="50" width="50" viewBox="0 0 24 24" fill="none" stroke="#ffff33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></Path>
                  <Path d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></Path>
                </Svg>
                <Text style={styles.imagePlaceholderText}>Tap to add an image</Text>
              </TouchableOpacity>
            )}

            <TextInput
              placeholder="Write about your day..."
              placeholderTextColor="#000"
              value={text}
              onChangeText={setText}
              multiline
              style={styles.input}
            />

            <View style={styles.dailyPromptContainer}>
              <Text style={styles.dailyPromptText}>
                What's one thing you're looking forward to tomorrow?
              </Text>
            </View>

            <View style={styles.moodTrackerContainer}>
              <Text style={styles.moodTrackerLabel}>How was your mood today?</Text>
              <View style={styles.moodOptions}>
                {moods.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.moodOption,
                      mood === m && styles.selectedMoodOption,
                    ]}
                    onPress={() => setMood(m)}
                  >
                    <Text style={styles.moodEmoji}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  animatedContent: {
    flex: 1,
  },
  swipeIndicatorContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#000',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  swipeIndicator: {
    width: 40,
    height: 5,
    backgroundColor: '#333',
    borderRadius: 2.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000',
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  infoDateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  infoIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoIcon: {
    padding: 8,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    gap: 16,
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  imagePlaceholderText: {
    color: '#ffff33',
    marginTop: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ffff33',
    backgroundColor: '#ffff33',
    padding: 10,
    minHeight: 150,
    textAlignVertical: 'top',
    borderRadius: 6,
    marginBottom: 10,
    color: '#000',
  },
  dailyPromptContainer: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  dailyPromptText: {
    color: '#aaa',
    fontSize: 14,
    fontStyle: 'italic',
  },
  moodTrackerContainer: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  moodTrackerLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  moodOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodOption: {
    padding: 12,
    borderRadius: 30,
    backgroundColor: '#333',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
  },
  selectedMoodOption: {
    borderColor: '#ffff33',
  },
  moodEmoji: {
    fontSize: 24,
  },
  savedIndicatorContainer: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 128, 0, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedIndicatorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
});