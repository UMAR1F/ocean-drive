// src/components/ai/SystemAssistantView.jsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, Card, Text, TextInput, Button, Group, Stack, 
  Avatar, ScrollArea, useMantineColorScheme 
} from '@mantine/core';
import { 
  IconRobot, 
  IconSend, 
  IconUser, 
  IconRefresh 
} from '@tabler/icons-react';
import { assistantService } from '../../services/assistantService';

const welcomeMessage = {
  sender: 'ai',
  text: 'Ask about available sales and inventory data, or how a feature in this app works. Answers use the data and access available to your account.',
};

export default function SystemAssistantView({ currentUser }) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const [messages, setMessages] = useState([welcomeMessage]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollAreaRef = useRef(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userQuery = inputMessage.trim();
    setMessages((currentMessages) => [...currentMessages, { sender: 'user', text: userQuery }]);
    setInputMessage('');
    setLoading(true);

    try {
      const answer = await assistantService.ask(userQuery, currentUser);
      setMessages((currentMessages) => [...currentMessages, { sender: 'ai', text: answer }]);
    } catch (error) {
      console.error('System assistant query failed:', error);
      setMessages((currentMessages) => [...currentMessages, {
        sender: 'ai',
        text: 'I could not load the data for that answer. Check your connection and account access, then try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPrompt = (promptText) => {
    setInputMessage(promptText);
  };

  return (
    <Box p={{ base: 'xs', md: 'md' }} maw={850} mx="auto" h="calc(100vh - 100px)" style={{ display: 'flex', flexDirection: 'column' }}>
      <Card withBorder shadow="sm" radius="md" p="md" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        
        {/* Header */}
        <Group justify="space-between" mb="md" pb="sm" style={{ borderBottom: `1px solid ${isDark ? 'var(--mantine-color-dark-4)' : '#eee'}` }}>
          <Group gap="sm">
            <Avatar color="ocean" radius="xl">
              <IconRobot size={20} />
            </Avatar>
            <div>
              <Text fw={700} size="sm">System Assistant</Text>
              <Text size="xs" c="dimmed">Grounded in accessible app data</Text>
            </div>
          </Group>
          <Button 
            variant="subtle" 
            size="xs" 
            leftSection={<IconRefresh size={14} />} 
            onClick={() => setMessages([welcomeMessage])}
          >
            Clear Chat
          </Button>
        </Group>

        {/* Chat Messages ScrollArea */}
        <ScrollArea viewportRef={scrollAreaRef} style={{ flex: 1, marginBottom: '16px' }} pr="sm">
          <Stack gap="md">
            {messages.map((msg, index) => (
              <Group 
                key={index} 
                justify={msg.sender === 'user' ? 'flex-end' : 'flex-start'}
                align="flex-start"
                gap="sm"
              >
                {msg.sender === 'ai' && (
                  <Avatar color="ocean" radius="xl" size="sm">
                    <IconRobot size={14} />
                  </Avatar>
                )}
                
                <Box 
                  p="sm" 
                  maw="80%"
                  style={{ 
                    backgroundColor: msg.sender === 'user' 
                      ? 'var(--mantine-color-ocean-7)' 
                      : (isDark ? 'var(--mantine-color-dark-6)' : '#f1f3f5'),
                    color: msg.sender === 'user' ? '#fff' : 'var(--mantine-color-text)',
                    borderRadius: '12px'
                  }}
                >
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</Text>
                </Box>

                {msg.sender === 'user' && (
                  <Avatar color="gray" radius="xl" size="sm">
                    <IconUser size={14} />
                  </Avatar>
                )}
              </Group>
            ))}

            {loading && (
              <Group justify="flex-start" gap="sm">
                  <Avatar color="ocean" radius="xl" size="sm">
                  <IconRobot size={14} />
                </Avatar>
                <Box p="sm" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-0)', borderRadius: '12px' }}>
                  <Text size="sm" c="dimmed">Checking available system data...</Text>
                </Box>
              </Group>
            )}
          </Stack>
        </ScrollArea>

        {/* Quick Suggestion Chips */}
        <Group gap="xs" mb="sm" wrap="wrap">
          <Button variant="light" size="compact-xs" radius="xl" onClick={() => handleQuickPrompt("What services and system data are active?")}>
            All System Services Data
          </Button>
          <Button variant="light" size="compact-xs" radius="xl" onClick={() => handleQuickPrompt("What are my top-selling products?")}>
            Sales & Top Products
          </Button>
          <Button variant="light" size="compact-xs" radius="xl" onClick={() => handleQuickPrompt("Tell me about Skylight Ethic and Abdul Aziz")}>
            About Skylight Ethic
          </Button>
          <Button variant="light" size="compact-xs" radius="xl" onClick={() => handleQuickPrompt("How does POS and offline sync work?")}>
            POS & Sync Engine
          </Button>
        </Group>

        {/* Input Form */}
        <form onSubmit={handleSendMessage}>
          <Group gap="sm">
            <TextInput
              placeholder="Ask about sales, inventory, or an app feature..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              style={{ flex: 1 }}
              radius="md"
            />
            <Button type="submit" radius="md" leftSection={<IconSend size={16} />} loading={loading}>
              Send
            </Button>
          </Group>
        </form>

      </Card>
    </Box>
  );
}