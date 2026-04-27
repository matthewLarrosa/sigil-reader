import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { audiobookGenerationService } from '@/features/tts/services/audiobook-generation-service';
import {
  getKokoroModelStatus,
  pickAndInstallKokoroAsset,
} from '@/features/tts/services/kokoro-model-pack';
import { KokoroModelStatus } from '@/features/tts/types';
import { kokoroBridge } from '@/native/kokoro-bridge';
import { useAppTheme } from '@/theme/theme-provider';
import { tokens } from '@/theme/tokens';

export function KokoroSetupScreen() {
  const { theme } = useAppTheme();
  const [modelStatus, setModelStatus] = useState<KokoroModelStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'model' | 'voice' | 'test' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await kokoroBridge.getStatus().catch(async () => getKokoroModelStatus(false));
      setModelStatus(status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to check Kokoro setup.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const installModelAsset = useCallback(
    async (kind: 'model' | 'voice') => {
      setBusyAction(kind);
      setMessage(null);
      try {
        const path = await pickAndInstallKokoroAsset(kind);
        setMessage(
          path
            ? `${kind === 'model' ? 'Model' : 'Voice'} asset installed.`
            : 'No Kokoro asset selected.',
        );
        await load();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to install Kokoro asset.');
      } finally {
        setBusyAction(null);
      }
    },
    [load],
  );

  const verifyModel = useCallback(async () => {
    setBusyAction('test');
    setMessage(null);
    try {
      const result = await audiobookGenerationService.verifyModelLoad();
      setMessage(result);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to verify Kokoro model.');
    } finally {
      setBusyAction(null);
    }
  }, [load]);

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.heading, { color: theme.colors.text }]}>Kokoro Setup</Text>
      <View
        style={[
          styles.panel,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Status</Text>
        <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
          {modelStatus?.message ?? 'Kokoro status is unavailable.'}
        </Text>
      </View>
      <View style={styles.buttonRow}>
        <Pressable
          disabled={Boolean(busyAction)}
          onPress={() => installModelAsset('model')}
          style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>
            {busyAction === 'model' ? 'Importing...' : 'Import Model'}
          </Text>
        </Pressable>
        <Pressable
          disabled={Boolean(busyAction)}
          onPress={() => installModelAsset('voice')}
          style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.text }}>
            {busyAction === 'voice' ? 'Importing...' : 'Import US Voice'}
          </Text>
        </Pressable>
        <Pressable
          disabled={Boolean(busyAction) || !modelStatus?.readyForModelLoad}
          onPress={verifyModel}
          style={[
            styles.secondaryButton,
            {
              borderColor: theme.colors.border,
              opacity: Boolean(busyAction) || !modelStatus?.readyForModelLoad ? 0.55 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.colors.text }}>
            {busyAction === 'test' ? 'Testing...' : 'Test Load'}
          </Text>
        </Pressable>
      </View>
      {message ? (
        <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: tokens.typography.heading,
    fontWeight: '700',
  },
  panel: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
  },
  sectionTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '700',
  },
  caption: {
    fontSize: tokens.typography.caption,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  message: {
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
});
