export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff'
});

export const USER_ROLE_OPTIONS = [
  { value: USER_ROLES.STAFF, label: 'Staff / Cashier' },
  { value: USER_ROLES.MANAGER, label: 'Manager' },
  { value: USER_ROLES.ADMIN, label: 'Administrator' }
];

export const isValidRole = (role) => Object.values(USER_ROLES).includes(role);

export const normalizeRole = (role) => isValidRole(role) ? role : USER_ROLES.STAFF;

export const canManageInventory = (role) => (
  role === USER_ROLES.ADMIN || role === USER_ROLES.MANAGER
);