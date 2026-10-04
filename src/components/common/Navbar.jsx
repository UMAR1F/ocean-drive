import React, { useState, useEffect } from 'react';
import { Group, Text, ActionIcon, Menu, Avatar, rem, Tooltip, useMantineColorScheme } from '@mantine/core';
import { IconSun, IconMoon, IconLogout, IconShieldCheck, IconUser, IconBell } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { settingsService } from '../../services/settingsService';

export default function Navbar({ onOpenNotifications }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { currentUser, logout } = useAuth();
  const [businessName, setBusinessName] = useState('Skylight Ethic POS');
  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState('');
  
  const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin;
  const userRole = isAdmin ? 'admin' : (currentUser?.role || 'staff');
  const userEmail = currentUser?.email || 'user@skylightethic.com';
  const userName = currentUser?.displayName || userEmail.split('@')[0];

  const isDark = colorScheme === 'dark';

  useEffect(() => {
    let isMounted = true;
    settingsService.getSettings()
      .then((settings) => {
        if (isMounted && settings?.businessName) {
          setBusinessName(settings.businessName);
        }
        if (isMounted && settings?.companyLogoDataUrl) {
          setCompanyLogoDataUrl(settings.companyLogoDataUrl);
        }
      })
      .catch((err) => {
        console.error("Failed to load store business name in Navbar:", err);
      });
    return () => { isMounted = false; };
  }, []);

  const handleLogout = async () => {
    try {
      if (typeof logout === 'function') {
        await logout();
      }
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  return (
    <Group 
      h="100%" 
      px={{ base: 'xs', sm: 'md' }} 
      justify="space-between" 
      bg={isDark ? 'dark.8' : 'white'}
      style={{ borderBottom: `1px solid ${isDark ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-2)'}` }}
      wrap="nowrap"
    >
      <Group gap="xs" style={{ minWidth: 0 }}>
        {companyLogoDataUrl && <img src={companyLogoDataUrl} alt={`${businessName} logo`} style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />}
        <Text fw={700} size={{ base: 'sm', sm: 'lg' }} c="ocean.7" truncate>
          {businessName}
        </Text>
      </Group>

      <Group gap={{ base: 'xs', sm: 'md' }} wrap="nowrap">
        {/* Notification Bell Icon */}
        <Tooltip label="Announcements & Voice Notes" position="bottom" withArrow>
          <ActionIcon
            variant="default"
            onClick={onOpenNotifications}
            size={32}
            radius="md"
            aria-label="Notifications"
            style={{ flexShrink: 0, position: 'relative' }}
          >
            <IconBell size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>

        {/* User Profile Menu */}
        <Menu shadow="md" width={220} position="bottom-end">
          <Menu.Target>
            <Tooltip label={userEmail} position="bottom" withArrow>
              <ActionIcon
                variant="subtle"
                color="ocean"
                size={36}
                radius="xl"
                aria-label="User Profile"
              >
                <Avatar size={32} color="ocean" radius="xl">
                  {userEmail.charAt(0).toUpperCase()}
                </Avatar>
              </ActionIcon>
            </Tooltip>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Label>Signed in as</Menu.Label>
            <Menu.Item leftSection={<IconUser style={{ width: rem(14), height: rem(14) }} />} disabled>
              <div style={{ lineHeight: 1.2 }}>
                <Text size="xs" fw={600} truncate>{userName}</Text>
                <Text size="10px" c="dimmed" truncate>{userEmail}</Text>
              </div>
            </Menu.Item>

            <Menu.Divider />

            <Menu.Item 
              leftSection={<IconShieldCheck style={{ width: rem(14), height: rem(14) }} />}
              disabled
            >
              Role: <Text span fw={600} tt="uppercase" c={isAdmin ? 'grape.5' : 'blue.5'}>{userRole}</Text>
            </Menu.Item>

            <Menu.Divider />

            <Menu.Item 
              color="red" 
              leftSection={<IconLogout style={{ width: rem(14), height: rem(14) }} />}
              onClick={handleLogout}
            >
              Logout Session
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <ActionIcon
          variant="default"
          onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
          size={32}
          radius="md"
          aria-label="Toggle color scheme"
          style={{ flexShrink: 0 }}
        >
          {isDark ? <IconSun size={16} stroke={1.5} /> : <IconMoon size={16} stroke={1.5} />}
        </ActionIcon>
      </Group>
    </Group>
  );
}