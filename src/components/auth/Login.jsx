// src/components/auth/Login.jsx
import { useState, useEffect } from 'react';
import { loginUser, registerUser } from '../../services/authService';
import { settingsService } from '../../services/settingsService';
import { TextInput, PasswordInput, Button, Paper, Title, Text, Container, Anchor, Group, Divider, Stack, Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Lock, Mail, User } from 'lucide-react';
import { IconBuildingStore, IconUserCode, IconAt, IconChevronDown, IconMapPin, IconPhone } from '@tabler/icons-react';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAdminBeenInitialized, setHasAdminBeenInitialized] = useState(true);

  const [businessName, setBusinessName] = useState('Skylight Ethic POS');
  const [supportEmail, setSupportEmail] = useState('Skylightethic@gmail.com');
  const [companyAddress, setCompanyAddress] = useState('Kaduna, Nigeria');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState('');

  useEffect(() => {
    // Check if master admin registration has already been completed before
    const adminInitialized = localStorage.getItem('skylight_admin_initialized') === 'true';
    setHasAdminBeenInitialized(adminInitialized);
    // If it's already initialized, ensure we stay on sign-in mode
    if (adminInitialized) {
      setIsRegistering(false);
    }

    let isMounted = true;
    settingsService.getSettings()
      .then((settings) => {
        if (isMounted && settings) {
          if (settings.businessName) setBusinessName(settings.businessName);
          if (settings.email) setSupportEmail(settings.email);
          if (settings.address) setCompanyAddress(settings.address);
          if (settings.phone) setCompanyPhone(settings.phone);
          if (settings.companyLogoDataUrl) setCompanyLogoDataUrl(settings.companyLogoDataUrl);
        }
      })
      .catch((err) => {
        console.error("Failed to load store business name in Login:", err);
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
        // Lock registration permanently after successful master admin setup
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
      
      // Force state update or reload so AuthContext picks up the new session
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
    <Container size={440} my={30}>
      <Group justify="space-between" align="center" mb="lg" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          {companyLogoDataUrl ? (
            <img src={companyLogoDataUrl} alt={`${businessName} logo`} style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <IconBuildingStore size={34} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <Title order={4} fw={700} lineClamp={1}>{businessName}</Title>
            <Text c="dimmed" size="xs">Secure point of sale</Text>
          </div>
        </Group>

        <Menu shadow="md" width={260} position="bottom-end">
          <Menu.Target>
            <Button variant="subtle" size="compact-sm" rightSection={<IconChevronDown size={14} />}>
              Company
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Company profile</Menu.Label>
            <Menu.Item leftSection={<IconMapPin size={14} />} disabled>
              {companyAddress || 'Address not set'}
            </Menu.Item>
            {companyPhone && <Menu.Item leftSection={<IconPhone size={14} />} disabled>{companyPhone}</Menu.Item>}
            <Menu.Item component="a" href={`mailto:${supportEmail}`} leftSection={<IconAt size={14} />}>
              {supportEmail}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Text c="dimmed" size="sm" ta="center" mb="md">
        {isRegistering ? 'Initialize your master admin account' : 'Sign in to continue to your workspace'}
      </Text>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={handleSubmit} className="space-y-4">
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
            mt="md"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button fullWidth mt="xl" type="submit" loading={loading} size="md" radius="md">
            {isRegistering ? 'Create Admin Account' : 'Sign In to Terminal'}
          </Button>

          {/* Only show the toggle option if the master admin has never been created */}
            {!hasAdminBeenInitialized && isRegistering && (
              <Text ta="center" mt="md" size="sm">
                Already have an account?{' '}
                <Anchor component="button" type="button" c="blue" onClick={() => setIsRegistering(false)}>
                  Sign in
                </Anchor>
              </Text>
            )}
        </form>

        <Divider my="lg" label="System & Developer Info" labelPosition="center" />

        {/* Company & Developer Info Section */}
        <Stack gap="xs">
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <IconBuildingStore size={18} style={{ marginTop: '2px', flexShrink: 0 }} color="var(--mantine-color-blue-5)" />
            <div>
              <Text size="xs" fw={700}>SKYLIGHT ETHIC</Text>
              <Text size="10px" c="dimmed">Advanced cross-platform software development, multi-tenant retail networks, and offline-first enterprise architectures.</Text>
            </div>
          </Group>

          <Group gap="xs" align="flex-start" wrap="nowrap" mt={4}>
            <IconUserCode size={18} style={{ marginTop: '2px', flexShrink: 0 }} color="var(--mantine-color-grape-5)" />
            <div>
              <Text size="xs" fw={700}>Lead Developer & Founder</Text>
              <Text size="10px" c="dimmed">Abdul Aziz Umar — Software Engineer specializing in scalable C#, .NET, and high-security web/mobile systems.</Text>
            </div>
          </Group>

          <Group gap="xs" align="center" wrap="nowrap" mt={4}>
            <IconAt size={16} style={{ flexShrink: 0 }} color="var(--mantine-color-cyan-5)" />
            <Text size="10px" fw={600} c="dimmed">
              Support / Contact: <Anchor href={`mailto:${supportEmail}`} size="10px" c="blue.6">{supportEmail}</Anchor>
            </Text>
          </Group>
        </Stack>
      </Paper>

      <Text ta="center" size="xs" c="dimmed" mt="xl">
        © {new Date().getFullYear()} SKYLIGHT ETHIC • {companyAddress}
      </Text>
    </Container>
  );
}