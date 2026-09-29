import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { AppleColors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? AppleColors.dark : AppleColors.light;

  return (
    <NativeTabs
      backgroundColor={colors.card}
      indicatorColor={colors.tint}
      labelStyle={{
        selected: { color: colors.tint },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Protection</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'shield', selected: 'shield.fill' }}
          md={{ default: 'shield', selected: 'shield' }}
          src={require('@/assets/images/tabIcons/protection.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="data">
        <NativeTabs.Trigger.Label>Data</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bolt', selected: 'bolt.fill' }}
          md={{ default: 'bolt', selected: 'bolt' }}
          src={require('@/assets/images/tabIcons/data-saver.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md={{ default: 'settings', selected: 'settings' }}
          src={require('@/assets/images/tabIcons/settings.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

