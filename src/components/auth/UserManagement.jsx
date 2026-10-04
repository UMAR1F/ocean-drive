// src/components/auth/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import { getAllUsers, createUserWithRole, updateUserRole, updateUserStatus, deleteUserAccount, adminSendPasswordResetLink } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { Title, Text, Card, Button, TextInput, PasswordInput, Select, Table, Badge, Group, Stack, ActionIcon, Modal } from '@mantine/core';
import { UserPlus, Shield, Edit, Trash2, KeyRound, Power } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { USER_ROLE_OPTIONS, USER_ROLES } from '../../utils/roles';

export default function UserManagement() {
  const { userRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(USER_ROLES.STAFF);
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal State
  const [opened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editRole, setEditRole] = useState(USER_ROLES.STAFF);
  const [updating, setUpdating] = useState(false);
  
  const [passwordModalOpened, { open: openPasswordModal, close: closePasswordModal }] = useDisclosure(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error("Error loading users:", err);
      notifications.show({ title: 'Error', message: 'Failed to load system users', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await createUserWithRole(email, password, role, fullName);
      notifications.show({
        title: 'Success',
        message: 'User provisioned successfully!',
        color: 'green',
      });
      setEmail('');
      setPassword('');
      setFullName('');
      setRole(USER_ROLES.STAFF);
      loadUsers();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err.message,
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (user) => {
    setSelectedUser(user);
    setEditRole(user.role || USER_ROLES.STAFF);
    openModal();
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    setUpdating(true);

    try {
      await updateUserRole(selectedUser.id, editRole);
      notifications.show({
        title: 'Success',
        message: 'User role updated successfully!',
        color: 'green',
      });
      closeModal();
      loadUsers();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to update role',
        color: 'red',
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenPasswordModal = (userToUpdate) => {
    setPasswordUser(userToUpdate);
    openPasswordModal();
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (!passwordUser) return;

    setSavingPassword(true);
    try {
      await adminSendPasswordResetLink(passwordUser.email);
      notifications.show({
        title: 'Reset link sent',
        message: `Firebase sent a password reset link to ${passwordUser.email}.`,
        color: 'green',
      });
      closePasswordModal();
      setPasswordUser(null);
    } catch (err) {
      notifications.show({
        title: 'Reset email failed',
        message: err.message || 'Could not send the password reset email.',
        color: 'red',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleToggleUserStatus = async (userToUpdate) => {
    const nextIsActive = userToUpdate.isActive === false;
    const action = nextIsActive ? 'enable' : 'disable';
    if (!window.confirm(`${action === 'enable' ? 'Enable' : 'Disable'} ${userToUpdate.email}?`)) return;

    setUpdatingStatusId(userToUpdate.id);
    try {
      await updateUserStatus(userToUpdate.id, nextIsActive);
      notifications.show({
        title: `User ${action}d`,
        message: nextIsActive ? 'The user can sign in again.' : 'The user will be signed out of the application.',
        color: 'green'
      });
      await loadUsers();
    } catch (err) {
      notifications.show({
        title: 'Could not update user status',
        message: err.message || 'Please try again.',
        color: 'red'
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to remove user record for ${userEmail}?`)) return;

    try {
      await deleteUserAccount(userId);
      notifications.show({
        title: 'Success',
        message: 'User removed successfully',
        color: 'green',
      });
      loadUsers();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to delete user',
        color: 'red',
      });
    }
  };

  if (userRole !== 'admin') {
    return (
      <Card withBorder p="xl" bg="red.0" style={{ borderColor: 'var(--mantine-color-red-2)' }}>
        <Text c="red.7" fw={500}>Access Denied. Administrator privileges are required to manage users.</Text>
      </Card>
    );
  }

  return (
    <div>
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2} className="flex items-center gap-2">
            User & Role Management
          </Title>
          <Text c="dimmed" size="sm">Admin-only user access, roles, and password reset controls</Text>
        </div>
      </Group>

      {/* Provision User Form */}
      <Card withBorder shadow="sm" radius="md" p="md" mb="xl">
        <Text fw={600} mb="md" size="md">
          Provision New User
        </Text>
        
        <form onSubmit={handleCreateUser}>
          <Stack gap="sm">
            <Group grow align="flex-end">
              <TextInput
                label="Full Name"
                placeholder="e.g. John Doe"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <TextInput
                label="Email Address"
                placeholder="staff@skylightethic.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Group>

            <Group grow align="flex-end">
              <PasswordInput
                label="Password"
                placeholder="Secure password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Select
                label="User Role"
                value={role}
                onChange={(val) => setRole(val || USER_ROLES.STAFF)}
                data={USER_ROLE_OPTIONS}
              />
            </Group>

            <Group justify="flex-end" mt="sm">
              <Button type="submit" loading={submitting} leftSection={<UserPlus size={16} />}>
                Create User
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>

      {/* Users List Table */}
      <Card withBorder shadow="sm" radius="md" p="md">
        <Text fw={600} mb="md">System Users ({users.length})</Text>
        <Table.ScrollContainer minWidth={500}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created Date</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr>
                  <Table.Td colSpan={6} align="center" style={{ padding: '2rem' }}>
                    <Text c="dimmed">Loading users...</Text>
                  </Table.Td>
                </Table.Tr>
              ) : users.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6} align="center" style={{ padding: '2rem' }}>
                    <Text c="dimmed">No users found.</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                users.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td fw={500}>{u.fullName || 'N/A'}</Table.Td>
                    <Table.Td>{u.email}</Table.Td>
                    <Table.Td>
                      <Badge 
                        variant="light" 
                        color={u.role === USER_ROLES.ADMIN ? 'red' : u.role === USER_ROLES.MANAGER ? 'teal' : 'blue'}
                        leftSection={<Shield size={12} />}
                      >
                        {u.role}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={u.isActive === false ? 'red' : 'teal'} variant="light">
                        {u.isActive === false ? 'Disabled' : 'Enabled'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Group gap="xs" justify="flex-end">
                        <ActionIcon 
                          variant="subtle" 
                          color="orange" 
                          onClick={() => handleOpenPasswordModal(u)} 
                          title="Send password reset link"
                          aria-label={`Send password reset link to ${u.email}`}
                        >
                          <KeyRound size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color={u.isActive === false ? 'teal' : 'orange'}
                          onClick={() => handleToggleUserStatus(u)}
                          title={u.isActive === false ? 'Enable user' : 'Disable user'}
                          loading={updatingStatusId === u.id}
                          aria-label={u.isActive === false ? `Enable ${u.email}` : `Disable ${u.email}`}
                        >
                          <Power size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(u)} title="Edit Role">
                          <Edit size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="red" onClick={() => handleDeleteUser(u.id, u.email)} title="Delete User">
                          <Trash2 size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Edit Role Modal */}
      <Modal opened={opened} onClose={closeModal} title="Edit User Role" radius="md">
        <Stack gap="md">
          <Text size="sm">
            Updating role for: <b>{selectedUser?.email}</b>
          </Text>
          <Select
            label="User Role"
            value={editRole}
            onChange={(val) => setEditRole(val || USER_ROLES.STAFF)}
            data={USER_ROLE_OPTIONS}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleUpdateRole} loading={updating}>Save Changes</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={passwordModalOpened}
        onClose={() => {
          if (savingPassword) return;
          closePasswordModal();
          setPasswordUser(null);
        }}
        title="Send password reset link"
        radius="md"
        closeOnClickOutside={!savingPassword}
        closeOnEscape={!savingPassword}
      >
        <form onSubmit={handleChangePassword}>
          <Stack gap="md">
            <Text size="sm">Firebase will email a secure password reset link to <b>{passwordUser?.email}</b>. The user chooses their new password from that link.</Text>
            <Group justify="flex-end">
              <Button type="button" variant="default" onClick={() => {
                closePasswordModal();
                setPasswordUser(null);
              }} disabled={savingPassword}>
                Cancel
              </Button>
              <Button type="submit" loading={savingPassword}>Send reset link</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </div>
  );
}