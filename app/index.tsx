import React, { useState, useEffect, useCallback, useRef } from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Linking,
  PanResponder,
  ScrollView,
  Animated,
  Alert,
  Dimensions, // Import Dimensions to get screen height
} from 'react-native';
import { useFonts } from 'expo-font';
import { Calendar } from 'react-native-calendars';
import { useRouter } from 'expo-router';
// NEW IMPORT: useSafeAreaInsets for dynamic safe area calculations
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Constants from 'expo-constants';

// Define the DateData type as it's typically provided by react-native-calendars callbacks
interface DateData {
  year: number;
  month: number;
  day: number;
  timestamp: number;
  dateString: string; //YYYY-MM-DD
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const years = Array.from({ length: 30 }, (_, i) => 2000 + i);

const DATES_WITH_CONTENT_KEY = 'dates_with_content';

// Access API Key securely from Constants.expoConfig.extra
const API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GEMINI_API_KEY;

// Initialize Gemini AI only if API_KEY is available
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY as string) : null;

const getDailyAIInsight = async (notesForToday: { id: string; text: string }[]): Promise<string> => {
  if (!genAI) {
    return "AI is offline: API key not configured.";
  }
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let prompt = "";
    if (notesForToday && notesForToday.length > 0) {
      const notesText = notesForToday.map(n => `- ${n.text}`).join('\n');
      prompt = `Analyze the following daily notes and provide a very concise, inspiring, or reflective 1-2 sentence insight or summary. Focus on key themes or future actions based on the notes. Example: "You focused on work tasks today. Don't forget to relax!"\n\nNotes:\n${notesText}`;
    } else {
      prompt = "Generate a very short, positive, and encouraging 1-2 sentence thought or prompt for a daily journaling app. Example: 'What's one small win you celebrated today?'";
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text.trim();
  } catch (error: unknown) {
    console.error("Error generating AI insight:", error);

    if (error instanceof Error) {
      if (error.message.includes('API key not valid') || error.message.includes('API_KEY_INVALID')) {
        return "AI is offline: Invalid API key. Please check your settings.";
      } else if (error.message.includes('blocked due to safety reasons')) {
        return "AI insight blocked due to safety guidelines.";
      }
    }
    return "Couldn't load AI insight. Try adding a note or check your internet connection!";
  }
};

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // Get safe area insets (includes status bar height)

  const [fontsLoaded] = useFonts({
    'Mulish-Light': require('../assets/fonts/Mulish-Light.ttf'),
    'Mulish-Regular': require('../assets/fonts/Mulish-Regular.ttf'),
    'Mulish-Bold': require('../assets/fonts/Mulish-Bold.ttf'),
  });

  const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const [currentDate, setCurrentDate] = useState(getTodayDateString());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showPicker, setShowPicker] = useState(false);

  // Load notes from AsyncStorage based on the currently selected date
  const loadNotesForSelectedDate = useCallback(async (dateString: string) => {
    try {
      const storedNotes = await AsyncStorage.getItem(`notes_${dateString}`);
      if (storedNotes) {
        setNotes(JSON.parse(storedNotes));
      } else {
        setNotes([]);
      }
    } catch (e) {
      console.error('Failed to load notes for date:', dateString, e);
      setNotes([]);
    }
  }, []);

  // Save notes to AsyncStorage for the currently selected date
  const saveNotesForSelectedDate = useCallback(async (dateString: string, currentNotes: { id: string; text: string }[]) => {
    try {
      await AsyncStorage.setItem(`notes_${dateString}`, JSON.stringify(currentNotes));

      // Update marked dates logic here
      const data = await AsyncStorage.getItem(DATES_WITH_CONTENT_KEY);
      let dates: string[] = data ? JSON.parse(data) : [];

      if (currentNotes.length > 0 && !dates.includes(dateString)) {
        dates = [...dates, dateString];
      } else if (currentNotes.length === 0 && dates.includes(dateString)) {
        dates = dates.filter(d => d !== dateString);
      }
      await AsyncStorage.setItem(DATES_WITH_CONTENT_KEY, JSON.stringify(dates));
      loadMarkedDates(); // Reload marked dates to reflect changes
    } catch (e) {
      console.error('Failed to save notes for date:', dateString, e);
    }
  }, []);


  const [notes, setNotes] = useState<{ id: string; text: string }[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<{ id: string; text: string } | null>(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(true); // Default to dark theme

  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showHelpFAQModal, setShowHelpFAQModal] = useState(false);

  const [markedDates, setMarkedDates] = useState<{ [key: string]: any }>({});

  const [aiInsight, setAiInsight] = useState('');
  const [loadingAiInsight, setLoadingAiInsight] = useState(false);

  // Use a state for the currently selected day to manage notes
  const [currentSelectedDay, setCurrentSelectedDay] = useState<string>(new Date().toISOString().split('T')[0]); //YYYY-MM-DD for today

  // --- PanResponder for Note Container ---
  const screenHeight = Dimensions.get('window').height;
  const HEADER_HEIGHT_ESTIMATE = 60; // Approximate height of your custom header

  // Define the minimum height (collapsed state) and maximum height (expanded state) for the notes panel
  const MIN_NOTES_HEIGHT = screenHeight * 0.40; // Initial height: 40% of screen height
  // Max height will now be up to the bottom of the header + status bar
  const MAX_NOTES_HEIGHT = screenHeight - insets.top - HEADER_HEIGHT_ESTIMATE;

  // Animated value for the height of the notes panel, initialized to its minimum height
  const animatedNotesHeight = useRef(new Animated.Value(MIN_NOTES_HEIGHT)).current;

  const panResponderNotes = useRef(
    PanResponder.create({
      // Allow pan responder to activate instantly on touch
      onStartShouldSetPanResponder: () => true,
      // Allow pan responder to activate as soon as a touch moves
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        // gestureState.dy is the cumulative change in Y position since the gesture started.
        // We want to adjust the height based on the vertical drag.
        // If dragging UP (dy is negative), we want to INCREASE the height.
        // If dragging DOWN (dy is positive), we want to DECREASE the height.
        // So, new height = current height - gestureState.dy
        // Use 'as any' to bypass TypeScript checking for the internal _value property
        const currentAnimatedHeightValue = (animatedNotesHeight as any)._value;
        const newHeight = currentAnimatedHeightValue - gestureState.dy;

        // Clamp the new height to ensure it stays within our defined min and max heights
        const clampedHeight = Math.max(MIN_NOTES_HEIGHT, Math.min(MAX_NOTES_HEIGHT, newHeight));
        animatedNotesHeight.setValue(clampedHeight); // Set the Animated.Value to the new clamped height
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Use 'as any' to bypass TypeScript checking for the internal _value property
        const currentHeight = (animatedNotesHeight as any)._value;
        const middlePoint = (MIN_NOTES_HEIGHT + MAX_NOTES_HEIGHT) / 2;

        // Determine the snap point based on vertical velocity (gestureState.vy) and current position
        // If swiping up quickly (negative vy) or if the current height is already past the midpoint towards max height
        if (gestureState.vy < -0.5 || currentHeight > middlePoint) {
          Animated.spring(animatedNotesHeight, {
            toValue: MAX_NOTES_HEIGHT, // Snap to the fully expanded state
            useNativeDriver: false, // Required for animating layout properties like 'height'
            friction: 7,              // Adjust for desired springiness
            tension: 40,              // Adjust for desired springiness
          }).start();
        } else {
          // If swiping down quickly (positive vy) or if the current height is already past the midpoint towards min height
          Animated.spring(animatedNotesHeight, {
            toValue: MIN_NOTES_HEIGHT, // Snap to the collapsed state
            useNativeDriver: false,
            friction: 7,
            tension: 40,
          }).start();
        }
      },
    })
  ).current;

  // PanResponder for modals to dismiss by swiping down (unchanged)
  const panResponderSettings = useState(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 50) { // If swiped down more than 50 pixels
          setShowSettingsModal(false);
        }
      },
      onPanResponderRelease: (evt, gestureState) => { },
    })
  )[0];

  const panResponderAbout = useState(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 50) {
          setShowAboutModal(false);
        }
      },
      onPanResponderRelease: (evt, gestureState) => { },
    })
  )[0];

  const panResponderHelpFAQ = useState(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 50) {
          setShowHelpFAQModal(false);
        }
      },
      onPanResponderRelease: (evt, gestureState) => { },
    })
  )[0];


  const updateCalendarDate = (monthIndex: number, year: number) => {
    const newDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    setCurrentDate(newDate);
    setSelectedMonthIndex(monthIndex);
    setSelectedYear(year);
    setShowPicker(false);
  };

  const applyPickerSelection = () => {
    updateCalendarDate(selectedMonthIndex, selectedYear);
  };

  const resetModalSelection = () => {
    const [year, month] = currentDate.split('-');
    setSelectedYear(parseInt(year));
    setSelectedMonthIndex(parseInt(month) - 1);
    setShowPicker(false);
  };

  const loadMarkedDates = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(DATES_WITH_CONTENT_KEY);
      const dates: string[] = data ? JSON.parse(data) : [];
      const newMarkedDates: { [key: string]: any } = {};
      dates.forEach(date => {
        newMarkedDates[date] = { marked: true, dotColor: '#ffff33' };
      });
      setMarkedDates(newMarkedDates);
    } catch (e) {
      console.error('Failed to load marked dates:', e);
    }
  }, []);

  const fetchAiInsight = useCallback(async () => {
    setLoadingAiInsight(true);
    // Fetch AI insight based on notes for the current selected day
    const insight = await getDailyAIInsight(notes);
    setAiInsight(insight);
    setLoadingAiInsight(false);
  }, [notes]); // Re-fetch AI insight when notes change

  // Effect for system UI and initial date setup
  useEffect(() => {
    // This sets the background color of the system UI below the content (e.g., if app is translucent)
    SystemUI.setBackgroundColorAsync(isDarkTheme ? '#000' : '#FFF');

    // Set initial current selected day to today
    const now = new Date();
    const todayDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setCurrentSelectedDay(todayDateString);

    // Logic to update "today" at midnight
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0); // Set to next midnight
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      // First run at midnight
      const newToday = new Date();
      const newTodayDateString = `${newToday.getFullYear()}-${String(newToday.getMonth() + 1).padStart(2, '0')}-${String(newToday.getDate()).padStart(2, '0')}`;
      setCurrentDate(`${newToday.getFullYear()}-${String(newToday.getMonth() + 1).padStart(2, '0')}-01`);
      setCurrentSelectedDay(newTodayDateString);
      setSelectedMonthIndex(newToday.getMonth());
      setSelectedYear(newToday.getFullYear());

      // Then set interval for every 24 hours
      const intervalId = setInterval(() => {
        const newTodayInterval = new Date();
        const newTodayDateStringInterval = `${newTodayInterval.getFullYear()}-${String(newTodayInterval.getMonth() + 1).padStart(2, '0')}-${String(newTodayInterval.getDate()).padStart(2, '0')}`;
        setCurrentDate(`${newTodayInterval.getFullYear()}-${String(newTodayInterval.getMonth() + 1).padStart(2, '0')}-01`);
        setCurrentSelectedDay(newTodayDateStringInterval);
        setSelectedMonthIndex(newTodayInterval.getMonth());
        setSelectedYear(newTodayInterval.getFullYear());
      }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

      return () => clearInterval(intervalId); // Cleanup interval
    }, msUntilMidnight);

    return () => clearTimeout(timeoutId); // Cleanup initial timeout
  }, [isDarkTheme]); // Only depends on isDarkTheme for SystemUI background color

  // Effect to load notes and AI insight when the currentSelectedDay changes
  useEffect(() => {
    if (currentSelectedDay) {
      loadNotesForSelectedDate(currentSelectedDay);
    }
  }, [currentSelectedDay, loadNotesForSelectedDate]);

  // When notes change, save them and then fetch AI insight
  useEffect(() => {
    if (currentSelectedDay) {
      saveNotesForSelectedDate(currentSelectedDay, notes);
      fetchAiInsight();
    }
  }, [notes, currentSelectedDay, saveNotesForSelectedDate, fetchAiInsight]);


  useFocusEffect(
    useCallback(() => {
      loadMarkedDates();
      // AI insight will be fetched when notes state updates from loadNotesForSelectedDate,
      // which is called when currentSelectedDay changes.
    }, [loadMarkedDates])
  );


  const handleAddNote = () => {
    if (noteInput.trim()) {
      setNotes([{ id: Date.now().toString(), text: noteInput.trim() }, ...notes]);
      setNoteInput('');
    }
  };

  const handleEditNote = () => {
    if (selectedNote && noteInput.trim()) {
      setNotes(notes.map(note =>
        note.id === selectedNote.id ? { ...note, text: noteInput.trim() } : note
      ));
      setShowNoteModal(false);
      setSelectedNote(null);
      setNoteInput('');
    }
  };

  const handleDeleteNote = () => {
    if (selectedNote) {
      Alert.alert(
        "Delete Note",
        "Are you sure you want to delete this note?",
        [
          {
            text: "Cancel",
            style: "cancel"
          },
          {
            text: "Delete",
            onPress: () => {
              setNotes(notes.filter(note => note.id !== selectedNote.id));
              setShowNoteModal(false);
              setSelectedNote(null);
              setNoteInput('');
            },
            style: "destructive"
          }
        ],
        { cancelable: true }
      );
    }
  };

  const openNoteOptions = (note: { id: string; text: string }) => {
    setSelectedNote(note);
    setNoteInput(note.text);
    setShowNoteModal(true);
  };

  const handleMonthChange = (monthData: DateData) => {
    setSelectedMonthIndex(monthData.month - 1);
    setSelectedYear(monthData.year);
  };

  const toggleTheme = () => {
    setIsDarkTheme(prevTheme => !prevTheme);
  };

  const handleGithubHelpFAQLink = () => {
    Linking.openURL('https://github.com/dixiemarielaput1/notepix-help-faq')
      .catch(err => console.error("Couldn't load Help & FAQ page", err));
    setShowHelpFAQModal(false);
  };

  const handlePrivacyPolicyLink = () => {
    Linking.openURL('https://github.com/dixiemarielaput1/notepix-privacy-policy')
      .catch(err => console.error("Couldn't load Privacy Policy", err));
    setShowAboutModal(false);
  };


  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <Text style={{ color: '#fff' }}>Loading Fonts...</Text>
      </View>
    );
  }

  return (
    // Replaced SafeAreaView with a regular View. RootLayout already provides SafeAreaProvider.
    <View style={[styles.container, { backgroundColor: isDarkTheme ? '#000' : '#FFF' }]}>
      {/* StatusBar is now managed globally in _layout.tsx */}

      <View style={styles.header}>
        <Text style={[styles.appName, { fontFamily: 'Mulish-Bold' }]}>NotePix</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.menuButton} onPress={() => setShowSettingsModal(true)}>
            {/* Adjusted main Svg fill to be dynamic with theme */}
            <Svg height="24" width="24" viewBox="0 0 24 24" fill={isDarkTheme ? "#fff" : "#000"}>
              <Circle cx="12" cy="5" r="2" fill={isDarkTheme ? "#fff" : "#000"} />
              <Circle cx="12" cy="12" r="2" fill={isDarkTheme ? "#fff" : "#000"} />
              <Circle cx="12" cy="19" r="2" fill={isDarkTheme ? "#fff" : "#000"} />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView style={styles.mainScrollView} contentContainerStyle={styles.mainScrollViewContent}>
          <Calendar
            key={`${currentDate}-${isDarkTheme}`}
            current={currentDate}
            onDayPress={(day: DateData) => {
              // Navigate to the day-entry screen, passing the selected date as a parameter
              router.push(`/day-entry/${day.dateString}`); // <--- CORRECTED NAVIGATION PATH
            }}
            hideArrows={true}
            enableSwipeMonths={true}
            onMonthChange={handleMonthChange}
            renderHeader={() => (
              <TouchableOpacity onPress={() => setShowPicker(true)}>
                <Text style={[styles.calendarHeaderText, { color: isDarkTheme ? '#ffff33' : '#000', fontFamily: 'Mulish-Bold' }]}>
                  {months[selectedMonthIndex]} {selectedYear}
                </Text>
              </TouchableOpacity>
            )}
            style={[styles.calendar, { backgroundColor: isDarkTheme ? '#000' : '#FFF' }]}
            theme={{
              backgroundColor: isDarkTheme ? '#000' : '#FFF',
              calendarBackground: isDarkTheme ? '#000' : '#FFF',
              textSectionTitleColor: isDarkTheme ? '#fff' : '#444',
              dayTextColor: isDarkTheme ? '#fff' : '#000',
              selectedDayBackgroundColor: '#ffff33',
              selectedDayTextColor: '#000',
              todayTextColor: '#ffff33',
              monthTextColor: isDarkTheme ? '#ffff33' : '#000',
              arrowColor: isDarkTheme ? '#fff' : '#000',
              textDisabledColor: isDarkTheme ? '#444' : '#BBB',
              textDayFontWeight: '500',
              textMonthFontFamily: 'Mulish-Bold',
              textDayFontSize: 12,
              textMonthFontSize: 18,
              textDayHeaderFontSize: 14,
              dotColor: '#ffff33',
              selectedDotColor: '#000',

            }}
            markedDates={{
              ...markedDates,
              [currentSelectedDay]: {
                ...markedDates[currentSelectedDay],
                selected: true,
                selectedColor: '#ffff33',
                selectedTextColor: '#000',
                dotColor: '#000', // Ensure dot is visible on selected day
              }
            }}
          />

          {/* AI Insight Card */}
          <View style={[styles.aiInsightCard, { backgroundColor: isDarkTheme ? '#222' : '#F0F0F0', borderColor: isDarkTheme ? '#333' : '#DDD' ,maxHeight: 120, padding: 10 }]}>
            <View style={styles.aiInsightHeader}>
              <Text style={[styles.aiInsightTitle, { color: isDarkTheme ? '#ffff33' : '#000', fontFamily: 'Mulish-Bold' , fontSize: 12 }]}>
                ✨ Your Daily Insight
              </Text>
            </View>
            {loadingAiInsight ? (
              <Text style={[styles.aiInsightText, { color: isDarkTheme ? '#888' : '#666', fontFamily: 'Mulish-Light' }]}>
                Generating insight...
              </Text>
            ) : (
              <Text style={[styles.aiInsightText, { color: isDarkTheme ? '#CCC' : '#333', fontFamily: 'Mulish-Regular' ,fontSize: 11 }]}>
                {aiInsight}
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Draggable Notes Container */}
        <Animated.View
          // Apply animated height directly instead of transformY
          style={[
            styles.notesOuterContainer,
            { height: animatedNotesHeight }
          ]}
          {...panResponderNotes.panHandlers}
        >
          <View style={styles.swipeDownIndicator} />
          {/* Moved addNoteContainer inside Animated.View */}
          <View style={styles.addNoteContainer}>
            <TextInput
              style={[styles.noteInput, { fontFamily: 'Mulish-Regular' }]}
              placeholder={`Add a new note for ${currentSelectedDay}...`}
              placeholderTextColor="#888"
              value={noteInput}
              onChangeText={setNoteInput}
            />
            <TouchableOpacity style={styles.addNoteButton} onPress={handleAddNote}>
              <Text style={[styles.addNoteButtonText, { fontFamily: 'Mulish-Regular' }]}>+</Text>
            </TouchableOpacity>
          </View>

          {/* This FlatList should now scroll */}
          <FlatList
            data={notes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.noteItem} onPress={() => openNoteOptions(item)}>
                <Text style={[styles.noteText, { fontFamily: 'Mulish-Regular' }]}>{item.text}</Text>
                <Text style={[styles.noteOptionsIcon, { fontFamily: 'Mulish-Bold' }]}>...</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={[styles.noNotesText, { fontFamily: 'Mulish-Regular' }]}>No quick notes yet for {currentSelectedDay}. Add one!</Text>}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.notesListContent}
            style={styles.notesList} // Add a style to give FlatList flex: 1 or a height
          />
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Month & Year Picker Modal (remains unchanged) */}
      <Modal visible={showPicker} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={applyPickerSelection}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView
                style={styles.modalContainerUpdated}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <Text style={[styles.modalTitle, { fontFamily: 'Mulish-Bold' }]}>Select Month & Year</Text>

                <View style={styles.pickerContent}>
                  <View style={styles.column}>
                    <Text style={[styles.columnTitle, { fontFamily: 'Mulish-Bold' }]}>Month</Text>
                    <FlatList
                      data={months}
                      keyExtractor={(item, index) => `month-${index}`}
                      renderItem={({ item, index }) => (
                        <TouchableOpacity
                          onPress={() => setSelectedMonthIndex(index)}
                          style={[
                            styles.item,
                            selectedMonthIndex === index && styles.selectedItem,
                          ]}
                        >
                          <Text style={[styles.itemText, { fontFamily: 'Mulish-Regular' }]}>{item}</Text>
                        </TouchableOpacity>
                      )}
                      showsVerticalScrollIndicator={false}
                    />
                  </View>

                  <View style={styles.column}>
                    <Text style={[styles.columnTitle, { fontFamily: 'Mulish-Bold' }]}>Year</Text>
                    <FlatList
                      data={years}
                      keyExtractor={(item) => `year-${item}`}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => setSelectedYear(item)}
                          style={[
                            styles.item,
                            selectedYear === item && styles.selectedItem,
                          ]}
                        >
                          <Text style={[styles.itemText, { fontFamily: 'Mulish-Regular' }]}>{item}</Text>
                        </TouchableOpacity>
                      )}
                      showsVerticalScrollIndicator={false}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => updateCalendarDate(selectedMonthIndex, selectedYear)}
                >
                  <Text style={[styles.confirmText, { fontFamily: 'Mulish-Bold' }]}>Set Date</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={resetModalSelection}>
                  <Text style={[styles.cancelText, { fontFamily: 'Mulish-Regular' }]}>Cancel</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Note Options Modal (remains unchanged, but ensures input field scrolls with keyboard) */}
      <Modal visible={showNoteModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowNoteModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              {/* Added KeyboardAvoidingView here for the note modal input */}
              <KeyboardAvoidingView
                style={styles.noteModalContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <Text style={[styles.noteModalTitle, { fontFamily: 'Mulish-Bold' }]}>Note Options</Text>
                {selectedNote && (
                  <TextInput
                    style={[styles.noteModalInput, { fontFamily: 'Mulish-Regular' }]}
                    value={noteInput}
                    onChangeText={setNoteInput}
                    placeholder="Edit your note..."
                    placeholderTextColor="#888"
                    multiline
                  />
                )}
                <TouchableOpacity
                  style={styles.noteModalButton}
                  onPress={handleEditNote}
                >
                  <Text style={[styles.noteModalButtonText, { fontFamily: 'Mulish-Bold' }]}>Apply Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.noteModalButton, styles.noteModalDeleteButton]}
                  onPress={handleDeleteNote}
                >
                  <Text style={[styles.noteModalButtonText, { fontFamily: 'Mulish-Bold' }]}>Delete Note</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.noteModalCancelButton}
                  onPress={() => setShowNoteModal(false)}
                >
                  <Text style={[styles.noteModalCancelText, { fontFamily: 'Mulish-Regular' }]}>Cancel</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Settings Modal (remains unchanged) */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSettingsModal(false)}>
          <View style={styles.fullScreenModalOverlay}>
            <View style={[styles.settingsModalContainerFullScreen, { backgroundColor: isDarkTheme ? '#111' : '#EEE' }]} {...panResponderSettings.panHandlers}>
              <Text style={[styles.settingsModalTitle, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Bold' }]}>Settings</Text>

              <TouchableOpacity style={[styles.settingsOption, { backgroundColor: isDarkTheme ? '#333' : '#DDD' }]} onPress={toggleTheme}>
                <Text style={[styles.settingsOptionText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>Dark Theme</Text>
                {isDarkTheme ? (
                  <Text style={[styles.checkbox, { fontFamily: 'Mulish-Regular' }]}>✅</Text>
                ) : (
                  <Text style={[styles.checkbox, { fontFamily: 'Mulish-Regular' }]}>⬜</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.settingsOption, { backgroundColor: isDarkTheme ? '#333' : '#DDD' }]} onPress={() => setShowAboutModal(true)}>
                <Text style={[styles.settingsOptionText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>About NotePix</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.settingsOption, { backgroundColor: isDarkTheme ? '#333' : '#DDD' }]} onPress={() => setShowHelpFAQModal(true)}>
                <Text style={[styles.settingsOptionText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>Help & FAQ</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.settingsOption, { backgroundColor: isDarkTheme ? '#333' : '#DDD' }]} onPress={handlePrivacyPolicyLink}>
                <Text style={[styles.settingsOptionText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>Privacy Policy</Text>
              </TouchableOpacity>

              <View style={styles.swipeDownIndicator} />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* About NotePix Modal (remains unchanged) */}
      <Modal visible={showAboutModal} transparent animationType="slide" onRequestClose={() => setShowAboutModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowAboutModal(false)}>
          <View style={styles.fullScreenModalOverlay}>
            <View style={[styles.settingsModalContainerFullScreen, { backgroundColor: isDarkTheme ? '#111' : '#EEE' }]} {...panResponderAbout.panHandlers}>
              <Text style={[styles.settingsModalTitle, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Bold' }]}>About NotePix</Text>
              <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }}>
                <Text style={[styles.aboutText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>
                  NotePix Calendar is your intuitive daily companion for organizing thoughts and tracking events.
                  Seamlessly blend your calendar with quick notes, ensuring you never miss a beat.
                </Text>
                <Text style={[styles.aboutText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>
                  Developed by A NotePix developer
                </Text>
                <Text style={[styles.aboutText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>
                  Version 1.0.0
                </Text>
              </ScrollView>
              <View style={styles.swipeDownIndicator} />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Help & FAQ Modal (remains unchanged) */}
      <Modal visible={showHelpFAQModal} transparent animationType="slide" onRequestClose={() => setShowHelpFAQModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowHelpFAQModal(false)}>
          <View style={styles.fullScreenModalOverlay}>
            <View style={[styles.settingsModalContainerFullScreen, { backgroundColor: isDarkTheme ? '#111' : '#EEE' }]} {...panResponderHelpFAQ.panHandlers}>
              <Text style={[styles.settingsModalTitle, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Bold' }]}>Help & FAQ</Text>
              <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }}>
                <Text style={[styles.aboutText, { color: isDarkTheme ? '#fff' : '#000', fontFamily: 'Mulish-Regular' }]}>
                  If you have questions, please check our GitHub for FAQs and support.
                </Text>
                <TouchableOpacity style={styles.githubLink} onPress={handleGithubHelpFAQLink}>
                  <Text style={[styles.linkText, { color: isDarkTheme ? '#ffff33' : '#000', fontFamily: 'Mulish-Bold' }]}>
                    Visit our GitHub
                  </Text>
                </TouchableOpacity>
              </ScrollView>
              <View style={styles.swipeDownIndicator} />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View> // Closing tag for the top-level View
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // NO paddingTop or marginTop here! RootLayout handles safe area.
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20, // Added padding for left/right
    paddingVertical: 10, // Added padding for top/bottom within the header itself
    backgroundColor: '#000', // Matches dark theme
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  appName: {
    fontSize: 24,
    color: '#ffff33', // Always yellow for visibility on black header
  },
  headerRight: {
    // Styles for the container of the menu button
  },
  menuButton: {
    padding: 5, // Small padding to make the touch target larger
  },
  calendarHeaderText: {
    fontSize: 18,
    fontFamily: 'Mulish-Bold',
  },
  calendar: {
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 10,
    // Background color is set dynamically via props
  },
  keyboardAvoidingContainer: {
    flex: 1, // Ensure this takes remaining space
  },
  mainScrollView: {
    flex: 1, // Ensure this scrolls and takes space
  },
  mainScrollViewContent: {
    paddingBottom: 20, // Add some bottom padding if content goes too low
  },
  aiInsightCard: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 8,
    borderWidth: 1,
    // The rest of the styles are already dynamic for theme
  },
  aiInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  aiInsightTitle: {
    // fontSize: 12, // Already set inline, moved here for consistency if needed
  },
  aiInsightText: {
    // fontSize: 11, // Already set inline, moved here for consistency if needed
  },
  notesOuterContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a', // Darker background for the notes section (changed from #111)
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16, // Changed from 20
    paddingTop: 10, // Changed from 15
    paddingBottom: Platform.OS === 'ios' ? 20 : 0, // Added padding for iOS safe area
    justifyContent: 'flex-start', // Ensures content starts from the top
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 20,
  },
  swipeDownIndicator: {
    width: 40,
    height: 5,
    backgroundColor: '#555',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: 10,
  },
  addNoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  noteInput: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginRight: 10,
    color: '#fff',
    fontSize: 16,
  },
  addNoteButton: {
    backgroundColor: '#ffff33',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addNoteButtonText: {
    color: '#000',
    fontSize: 24,
    lineHeight: 28, // Adjust line height to center '+' vertically
  },
  notesList: {
    flex: 1, // Allows the FlatList to take available vertical space
    // height: 'auto', // Or a fixed height if you know it
  },
  notesListContent: {
    paddingBottom: 20, // Ensure content isn't cut off at the bottom
  },
  noteItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  noteText: {
    color: '#fff',
    flex: 1, // Allows text to take available space
  },
  noteOptionsIcon: {
    color: '#888', // Grey for dots
    fontSize: 20,
    marginLeft: 10,
  },
  noNotesText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 20,
  },
  // Modal styles (common to all modals)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainerUpdated: {
    width: '90%',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 20,
    color: '#fff',
  },
  pickerContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  columnTitle: {
    fontSize: 16,
    marginBottom: 10,
    color: '#ccc',
  },
  item: {
    paddingVertical: 10,
    width: '80%',
    alignItems: 'center',
  },
  selectedItem: {
    backgroundColor: '#ffff33',
    borderRadius: 5,
  },
  itemText: {
    fontSize: 18,
    color: '#fff',
  },
  confirmButton: {
    backgroundColor: '#ffff33',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
  },
  confirmText: {
    color: '#000',
    fontSize: 18,
  },
  cancelText: {
    color: '#fff',
    marginTop: 15,
    fontSize: 16,
  },
  noteModalContainer: {
    width: '90%',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  noteModalTitle: {
    fontSize: 20,
    marginBottom: 20,
    color: '#fff',
  },
  noteModalInput: {
    width: '100%',
    backgroundColor: '#333',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: '#fff',
    minHeight: 80, // For multiline input
    textAlignVertical: 'top', // For multiline on Android
  },
  noteModalButton: {
    backgroundColor: '#ffff33',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  noteModalButtonText: {
    color: '#000',
    fontSize: 18,
  },
  noteModalDeleteButton: {
    backgroundColor: '#FF6347', // Red color for delete
  },
  noteModalCancelButton: {
    marginTop: 15,
  },
  noteModalCancelText: {
    color: '#fff',
    fontSize: 16,
  },
  fullScreenModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end', // Align to bottom for slide-up effect
  },
  settingsModalContainerFullScreen: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    alignItems: 'center',
    height: '100%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20, // Adjust for iOS safe area at bottom
  },
  settingsModalTitle: {
    fontSize: 22,
    marginBottom: 20,
  },
  settingsOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  settingsOptionText: {
    fontSize: 18,
  },
  checkbox: {
    fontSize: 20,
  },
  aboutText: {
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 20,
    paddingHorizontal: 20, // Added padding for text
  },
  githubLink: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#444', // A distinct background for the link button
  },
  linkText: {
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});
