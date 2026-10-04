// src/components/auth/Login.jsx
import { useState, useEffect } from 'react';
import { loginUser, registerUser } from '../../services/authService';
import { settingsService } from '../../services/settingsService';
import {
  TextInput,
  PasswordInput,
  Button,
  Paper,
  Text,
  Anchor,
  Group,
  Stack,
  Divider,
  ActionIcon,
  Box,
  Title,
  Grid,
  ThemeIcon,
  useMantineColorScheme,
  Center,
  rem,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Lock, Mail, User, TrendingUp, Sparkles, PackageCheck, ShieldCheck, SunMedium, MoonStar } from 'lucide-react';
import { IconBuildingStore, IconUserCode, IconAt } from '@tabler/icons-react';

const marqueeWords = [
  'Retail Intelligence',
  'Secure POS',
  'Smart Inventory',
  'Offline Ready',
  'Multi-Store Ops',
  'Business Growth',
];

export default function Login() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAdminBeenInitialized, setHasAdminBeenInitialized] = useState(true);

  const [businessName, setBusinessName] = useState('Skylight Ethic POS');
  const [supportEmail, setSupportEmail] = useState('Skylightethic@gmail.com');
  const [companyAddress, setCompanyAddress] = useState('Kaduna, Nigeria');
  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState('');

  useEffect(() => {
    const adminInitialized = localStorage.getItem('skylight_admin_initialized') === 'true';
    setHasAdminBeenInitialized(adminInitialized);
    if (adminInitialized) setIsRegistering(false);

    let isMounted = true;
    settingsService.getSettings()
      .then((settings) => {
        if (isMounted && settings) {
          if (settings.businessName) setBusinessName(settings.businessName);
          if (settings.email) setSupportEmail(settings.email);
          if (settings.address) setCompanyAddress(settings.address);
          if (settings.companyLogoDataUrl) setCompanyLogoDataUrl(settings.companyLogoDataUrl);
        }
      })
      .catch((err) => {
        console.error('Failed to load store business name in Login:', err);
      });

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const handleRegistrationShortcut = (event) => {
      if (event.altKey && event.key.toLowerCase() === 'r' && !hasAdminBeenInitialized) {
        event.preventDefault();
        setIsRegistering(true);
      }
    };

    window.addEventListener('keydown', handleRegistrationShortcut);
    return () => window.removeEventListener('keydown', handleRegistrationShortcut);
  }, [hasAdminBeenInitialized]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegistering) {
        await registerUser(email, password, fullName, 'admin');
        localStorage.setItem('skylight_admin_initialized', 'true');
        setHasAdminBeenInitialized(true);
        setIsRegistering(false);

        notifications.show({
          title: 'Success',
          message: 'Master admin account created and logged in!',
          color: 'green',
        });
      } else {
        await loginUser(email, password);
        notifications.show({
          title: 'Success',
          message: 'Logged in successfully!',
          color: 'green',
        });
      }

      window.location.reload();
    } catch (err) {
      notifications.show({
        title: 'Authentication Error',
        message: err.message,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        background: isDark
          ? 'radial-gradient(circle at top left, rgba(35, 104, 214, 0.22), transparent 30%), linear-gradient(135deg, #020817 0%, #0f172a 45%, #111827 100%)'
          : 'radial-gradient(circle at top left, rgba(96, 165, 250, 0.18), transparent 30%), linear-gradient(135deg, #eff6ff 0%, #f8fafc 40%, #eef2ff 100%)',
        padding: 'clamp(12px, 2vw, 28px)',
      }}
    >
      <Center h="100vh">
        <Grid
          gutter={0}
          align="stretch"
          style={{
            width: 'min(1200px, 100%)',
            minHeight: '760px',
            borderRadius: 28,
            overflow: 'hidden',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.25)'}`,
            boxShadow: isDark ? '0 30px 80px rgba(2, 6, 23, 0.52)' : '0 20px 55px rgba(15, 23, 42, 0.12)',
            background: isDark ? 'rgba(15, 23, 42, 0.86)' : 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Grid.Col span={{ base: 12, lg: 7 }}
            style={{
              background: isDark
                ? 'linear-gradient(135deg, #081827 0%, #0b1f33 38%, #12324d 100%)'
                : 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 28%, #dbeafe 100%)',
              position: 'relative',
              padding: 'clamp(20px, 3vw, 36px)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box style={{ position: 'relative', zIndex: 1 }}>
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                  <ThemeIcon size={48} radius={16} variant="light" color={isDark ? 'blue' : 'ocean'}>
                    {companyLogoDataUrl ? (
                      <img src={companyLogoDataUrl} alt={`${businessName} logo`} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    ) : (
                      <IconBuildingStore size={22} />
                    )}
                  </ThemeIcon>

                  <Box>
                    <Text fw={700} size="lg" c={isDark ? 'white' : 'dark.8'}>{businessName}</Text>
                    <Text size="xs" c={isDark ? 'gray.4' : 'gray.7'}>Business operations suite</Text>
                  </Box>
                </Group>

                <ActionIcon
                  variant={isDark ? 'filled' : 'default'}
                  size="lg"
                  radius="xl"
                  aria-label="Toggle color scheme"
                  onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
                  color={isDark ? 'yellow' : 'gray'}
                >
                  {isDark ? <SunMedium size={18} /> : <MoonStar size={18} />}
                </ActionIcon>
              </Group>
            </Box>

            <Box style={{ position: 'relative', zIndex: 1, paddingTop: rem(12) }}>
              <Text
                fw={700}
                tt="uppercase"
                size="xs"
                c={isDark ? 'cyan.3' : 'blue.7'}
                style={{ letterSpacing: '0.16em' }}
              >
                Smart business platform
              </Text>

              <Title
                order={1}
                mt="md"
                style={{
                  fontSize: 'clamp(2.4rem, 4vw, 5rem)',
                  lineHeight: 0.92,
                  letterSpacing: '-0.06em',
                  color: isDark ? 'white' : '#0f172a',
                }}
              >
                Run your store with confidence.
              </Title>

              <Text mt="lg" size="lg" c={isDark ? 'gray.3' : 'gray.7'} maw={560}>
                Manage sales, inventory, customers, and reporting from one secure workspace built for modern retail operations.
              </Text>

              <Group mt="xl" gap="md" wrap="wrap">
                {[
                  { value: '24/7', label: 'Access' },
                  { value: '99.9%', label: 'Uptime' },
                  { value: '1-Click', label: 'Insights' },
                ].map((stat) => (
                  <Paper
                    key={stat.label}
                    p="md"
                    radius="lg"
                    withBorder
                    style={{
                      minWidth: 120,
                      background: isDark ? 'rgba(15, 23, 42, 0.42)' : 'rgba(255,255,255,0.62)',
                      borderColor: isDark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.25)',
                    }}
                  >
                    <Text fw={700} size="lg" c={isDark ? 'white' : 'dark.9'}>{stat.value}</Text>
                    <Text size="xs" tt="uppercase" c={isDark ? 'gray.4' : 'gray.7'}>{stat.label}</Text>
                  </Paper>
                ))}
              </Group>
            </Box>

            <Box style={{ position: 'relative', zIndex: 1, overflow: 'hidden', borderTop: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.28)'}`, borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.28)'}`, background: isDark ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.35)', padding: '12px 0' }}>
              <Stack gap={0} style={{ minWidth: 'max-content', animation: 'marquee 22s linear infinite', whiteSpace: 'nowrap' }}>
                {[...marqueeWords, ...marqueeWords].map((word, index) => (
                  <Group key={`${word}-${index}`} gap="xs" style={{ display: 'inline-flex', marginRight: 16 }}>
                    <TrendingUp size={14} color={isDark ? '#93c5fd' : '#1d4ed8'} />
                    <Text size="xs" fw={700} tt="uppercase" c={isDark ? 'gray.2' : 'dark.7'}>{word}</Text>
                  </Group>
                ))}
              </Stack>
              <style>{`
                @keyframes marquee {
                  0% { transform: translateX(0); }
                  100% { transform: translateX(-50%); }
                }
              `}</style>
            </Box>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 5 }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? '#0f172a' : '#f8fafc', padding: 'clamp(18px, 2vw, 32px)' }}>
            <Paper
              radius={26}
              p="xl"
              withBorder
              style={{
                width: '100%',
                maxWidth: 430,
                background: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255,255,255,0.82)',
                borderColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.25)',
                boxShadow: isDark ? '0 18px 40px rgba(2,6,23,0.28)' : '0 12px 28px rgba(15, 23, 42, 0.08)',
              }}
            >
              <Stack gap="lg">
                <Box>
                  <Text fw={700} tt="uppercase" size="xs" c={isDark ? 'cyan.3' : 'blue.7'}>Secure access</Text>
                  <Title order={2} mt="xs" c={isDark ? 'white' : 'dark.9'}>
                    {isRegistering ? 'Create admin account' : 'Welcome back'}
                  </Title>
                  <Text size="sm" c={isDark ? 'gray.4' : 'gray.7'} mt="xs">
                    {isRegistering
                      ? 'Set up your master admin account to begin managing the workspace.'
                      : 'Sign in to continue to your business dashboard.'}
                  </Text>
                </Box>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {isRegistering && (
                    <TextInput
                      label="Full Name"
                      placeholder="Abdul Aziz Umar"
                      required
                      leftSection={<User size={16} />}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  )}

                  <TextInput
                    label="Email Address"
                    placeholder="you@skylightethic.com"
                    required
                    leftSection={<Mail size={16} />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <PasswordInput
                    label="Password"
                    placeholder="Your secure password"
                    required
                    leftSection={<Lock size={16} />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <Button
                    type="submit"
                    loading={loading}
                    size="md"
                    radius="md"
                    style={{
                      background: isDark
                        ? 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)'
                        : 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
                      color: 'white',
                      fontWeight: 700,
                      height: 48,
                    }}
                  >
                    {isRegistering ? 'Create Admin Account' : 'Sign In to Terminal'}
                  </Button>

                  {!hasAdminBeenInitialized && isRegistering && (
                    <Text ta="center" size="sm" c={isDark ? 'gray.4' : 'gray.7'}>
                      Already have an account?{' '}
                      <Anchor component="button" type="button" c="blue" onClick={() => setIsRegistering(false)}>
                        Sign in
                      </Anchor>
                    </Text>
                  )}
                </form>

                <Divider label="Platform highlights" labelPosition="center" color={isDark ? 'gray.7' : 'gray.3'} />

                <Stack gap="xs">
                  <Group gap="xs" wrap="nowrap">
                    <ShieldCheck size={16} color={isDark ? '#7dd3fc' : '#2563eb'} />
                    <Text size="sm" fw={600} c={isDark ? 'gray.2' : 'dark.7'}>Secure access</Text>
                  </Group>

                  <Group gap="xs" wrap="nowrap">
                    <PackageCheck size={16} color={isDark ? '#a7f3d0' : '#16a34a'} />
                    <Text size="sm" fw={600} c={isDark ? 'gray.2' : 'dark.7'}>Inventory + sales monitoring</Text>
                  </Group>

                  <Group gap="xs" wrap="nowrap">
                    <IconUserCode size={16} color={isDark ? '#c4b5fd' : '#7c3aed'} />
                    <Text size="sm" fw={600} c={isDark ? 'gray.2' : 'dark.7'}>Lead Developer • Abdul Aziz Umar</Text>
                  </Group>

                  <Group gap="xs" wrap="nowrap">
                    <IconAt size={16} color={isDark ? '#67e8f9' : '#0ea5e9'} />
                    <Text size="sm" c={isDark ? 'gray.3' : 'gray.7'}>
                      <Anchor href={`mailto:${supportEmail}`} c={isDark ? 'cyan.4' : 'blue.6'}>{supportEmail}</Anchor>
                    </Text>
                  </Group>
                </Stack>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Center>
    </Box>
  );
}