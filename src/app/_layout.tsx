import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { SettingsSync } from '@/components/settings-sync';
import { FirebaseProvider } from '@/context/firebase-context';
import { VpnProvider } from '@/context/vpn-context';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <VpnProvider>
        <FirebaseProvider>
          <SettingsSync />
          <AnimatedSplashOverlay />
          <AppTabs />
        </FirebaseProvider>
      </VpnProvider>
    </ThemeProvider>
  );
}

