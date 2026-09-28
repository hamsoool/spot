import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet, Text } from 'react-native';
import { AppleIcon, IconName } from './ui/apple-icon';
import { useAppleTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function AppTabs() {
  const theme = useAppleTheme();

  return (
    <Tabs>
      <TabSlot style={{ height: '100%', backgroundColor: theme.background }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="shield" label="Protection" />
          </TabTrigger>
          <TabTrigger name="locations" href="/locations" asChild>
            <TabButton icon="globe" label="Locations" />
          </TabTrigger>
          <TabTrigger name="data-saver" href="/data-saver" asChild>
            <TabButton icon="bolt" label="Data Saver" />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon="settings" label="Settings" />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

interface TabButtonProps extends TabTriggerSlotProps {
  icon: IconName;
  label: string;
}

export function TabButton({ icon, label, isFocused, ...props }: TabButtonProps) {
  const theme = useAppleTheme();
  const color = isFocused ? theme.tint : theme.textSecondary;

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.tabButton,
        pressed && styles.pressed,
      ]}>
      <AppleIcon name={icon} size={20} color={color} />
      <Text
        style={[
          styles.tabLabel,
          { color, fontWeight: isFocused ? '600' : '500' },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const theme = useAppleTheme();

  return (
    <View
      {...props}
      style={[
        styles.tabBarContainer,
        {
          backgroundColor: theme.card,
          borderTopColor: theme.separator,
        },
      ]}>
      <View style={styles.innerContainer}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerContainer: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.md,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: -0.2,
  },
  pressed: {
    opacity: 0.6,
  },
});
