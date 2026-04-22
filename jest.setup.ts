jest.mock('expo-router', () => ({
  Link: 'Link',
  Stack: {
    Screen: 'StackScreen',
  },
  Tabs: {
    Screen: 'TabsScreen',
  },
}));
