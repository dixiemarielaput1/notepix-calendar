import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar'; // Expo's cross-platform Status Bar (for component and style)
import { useEffect } from 'react';
import { Platform, View, StyleSheet, StatusBar as NativeStatusBar } from 'react-native'; // Import View, StyleSheet, AND NativeStatusBar from react-native for currentHeight
import * as NavigationBar from 'expo-navigation-bar'; // Corrected import for Android Navigation Bar
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'; // NEW IMPORTS

export default function RootLayout() {
  const insets = useSafeAreaInsets(); // Hook to get safe area dimensions

  useEffect(() => {
    // Set Android Navigation Bar Color and Style
    if (Platform.OS === 'android') {
      try {
        // With edge-to-edge enabled, directly setting the background color of the bottom
        // navigation bar (using setBackgroundColorAsync) is often ignored by the system
        // and generates warnings, as the system takes control for transparency/gestures.
        // We will remove this call to reduce warnings, as it's often not effective.
        // NavigationBar.setBackgroundColorAsync('black'); // Removed due to edge-to-edge limitations and warnings

        // Setting the button style ('light' for dark background, 'dark' for light background)
        // is generally still effective for ensuring proper icon contrast, even with edge-to-edge.
        NavigationBar.setButtonStyleAsync('light');
      } catch (error) {
        console.warn('Failed to set Android navigation bar properties:', error);
      }
    }
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  // Calculate the status bar height dynamically.
  // For iOS, use the top inset from safe area context.
  // For Android, use NativeStatusBar.currentHeight (which provides the actual height).
  const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? insets.top : NativeStatusBar.currentHeight;

  return (
    // Wrap the entire app with SafeAreaProvider to make insets available
    <SafeAreaProvider>
      {/*
        This View acts as a custom background for the status bar.
        It sits at the very top and ensures your desired color is visible,
        even when edge-to-edge display is enabled.
      */}
      <View style={[styles.statusBarBackground, { height: STATUS_BAR_HEIGHT }]}>
        {/*
          The StatusBar component itself now primarily controls the text/icon style.
          Its 'backgroundColor' and 'translucent' props are often ignored on
          Android when edge-to-edge is enabled, as the system manages the drawing.
          We set 'style="light"' for light-colored icons on our dark background.
        */}
        <StatusBar style="light" />
      </View>

      {/*
        Expo Router's Stack component manages screen navigation.
        All screens defined in your 'app' directory will be part of this stack.
        Content within the Stack will now appear *below* our custom status bar background.
      */}
      <Stack>
        {/*
          IMPORTANT FIX: Hide the default header for the 'index' screen.
          This prevents Expo Router from rendering a default header for your main screen.
        */}
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/*
          FIX: Hide the default header for the 'day-entry' screen.
          This will remove the white header with text like 'day-entry/[selected-date]'
          from the DayEntryScreen.
        */}
        <Stack.Screen name="day-entry/[selectedDate]" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  statusBarBackground: {
    backgroundColor: 'black', // Set your desired status bar background color here
    // These absolute positioning properties are generally not needed when it's the
    // direct parent of the Stack, but good to know if layout issues occur:
    // position: 'absolute',
    // top: 0,
    // left: 0,
    // right: 0,
    // zIndex: 1, // Ensures it sits above other content if necessary
  },
});
