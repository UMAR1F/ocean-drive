// src/components/NotificationsView.jsx
import React, { useState, useEffect } from 'react';
import { 
  Paper, Title, Text, Group, Button, TextInput, Textarea, Card, Stack, Badge, ActionIcon, Loader 
} from '@mantine/core';
import { IconVolume, IconVolumeOff, IconSend, IconBell, IconRefresh } from '@tabler/icons-react';
import { notificationService } from '../services/notificationService';
import { ttsHelper } from '../utils/ttsHelper';
import { notifications } from '@mantine/notifications';

export function NotificationsView({ currentUser }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [playingId, setPlayingId] = useState(null);

  // Form states (Admin only)
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin || currentUser?.userRole === 'admin';

  const fetchNotices = async () => {
    setLoading(true);
    try {
      const data = await notificationService.getNotices();
      setNotices(data);
    } catch (err) {
      console.error(err);
      notifications.show({ title: 'Error', message: 'Failed to load notices', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
    return () => ttsHelper.stop(); // Stop audio if component unmounts
  }, []);

  const handleSendNotice = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    try {
      await notificationService.sendNotice({
        title: title || 'General Announcement',
        message,
        adminUser: currentUser
      });

      notifications.show({ title: 'Success', message: 'Notice broadcasted to all staff!', color: 'green' });
      setTitle('');
      setMessage('');
      fetchNotices();
    } catch (err) {
      notifications.show({ title: 'Failed', message: err.message, color: 'red' });
    } finally {
      setSending(false);
    }
  };

  const handlePlayVoiceNote = (id, text) => {
    if (playingId === id) {
      ttsHelper.stop();
      setPlayingId(null);
      return;
    }

    setPlayingId(id);
    ttsHelper.speak(
      text, 
      () => setPlayingId(id), 
      () => setPlayingId(null)
    );
  };

  return (
    <Stack gap="lg" pb="xl">
      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>Staff Broadcasts & Voice Notices</Title>
          <Text size="sm" c="dimmed">Read company updates or listen to them via Text-to-Speech audio.</Text>
        </div>
        <ActionIcon variant="light" size="lg" onClick={fetchNotices} loading={loading}>
          <IconRefresh size={20} />
        </ActionIcon>
      </Group>

      {/* Admin Broadcast Form */}
      {isAdmin && (
        <Card shadow="sm" p="md" radius="md" withBorder>
          <Title order={4} mb="sm">Broadcast New Notice (Admin)</Title>
          <form onSubmit={handleSendNotice}>
            <Stack gap="sm">
              <TextInput 
                placeholder="Notice Title (e.g., Closing Time Update)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea 
                placeholder="Type your notice instructions here for staff text & voice reading..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                minRows={3}
                required
              />
              <Button type="submit" leftSection={<IconSend size={16} />} loading={sending} color="blue">
                Send to All Staff
              </Button>
            </Stack>
          </form>
        </Card>
      )}

      {/* Notice Feed List */}
      <Stack gap="md">
        <Title order={3}>Notice Board</Title>
        {loading ? (
          <Group justify="center" p="xl"><Loader size="lg" /></Group>
        ) : notices.length === 0 ? (
          <Paper p="xl" ta="center" withBorder radius="md">
            <IconBell size={40} color="gray" />
            <Text c="dimmed" mt="sm">No notices available right now.</Text>
          </Paper>
        ) : (
          notices.map((notice) => (
            <Card key={notice.id} shadow="sm" p="md" radius="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Group gap="sm">
                  <Badge color="blue" variant="light">{notice.title}</Badge>
                  <Text size="xs" c="dimmed">By {notice.senderName}</Text>
                </Group>
                <Text size="xs" ff="monospace">
                  {(notice.createdAt || notice.timestamp) ? (notice.createdAt || notice.timestamp).replace('T', ' ').substring(0, 16) : 'Recent'}
                </Text>
              </Group>

              <Text size="sm" mb="md" style={{ whiteSpace: 'pre-wrap' }}>
                {notice.message}
              </Text>

              <Group justify="flex-end">
                <Button 
                  variant={playingId === notice.id ? 'filled' : 'light'} 
                  color={playingId === notice.id ? 'red' : 'teal'}
                  size="xs"
                  leftSection={playingId === notice.id ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
                  onClick={() => handlePlayVoiceNote(notice.id, `${notice.title}. ${notice.message}`)}
                >
                  {playingId === notice.id ? 'Stop Voice Note' : 'Play Voice Note (TTS)'}
                </Button>
              </Group>
            </Card>
          ))
        )}
      </Stack>
    </Stack>
  );
}