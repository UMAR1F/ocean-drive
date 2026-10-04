// src/services/authService.js
import { 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { initializeApp, getApps } from 'firebase/app';
import { isValidRole, normalizeRole, USER_ROLES } from '../utils/roles';

const assertValidRole = (role) => {
  if (!isValidRole(role)) throw new Error('Choose a valid user role.');
};

const requireAdmin = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in with an administrator account to manage users.');
  const adminSnapshot = await getDoc(doc(db, 'users', currentUser.uid));
  if (!adminSnapshot.exists() || adminSnapshot.data().role !== USER_ROLES.ADMIN || adminSnapshot.data().isActive === false) {
    throw new Error('Administrator access is required to manage users.');
  }
  return currentUser;
};

// Login service
export const loginUser = async (email, password) => {
  await setPersistence(auth, browserLocalPersistence);
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Fetch role from Firestore
  const userDocRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userDocRef);
  
  let role = USER_ROLES.STAFF;
  if (userDoc.exists()) {
    const userData = userDoc.data();
    if (userData.isActive === false) {
      await signOut(auth);
      throw new Error('This account is disabled. Contact an administrator.');
    }
    role = normalizeRole(userData.role);
  }

  return { user, role };
};

// Register initial admin/user service
export const registerUser = async (email, password, fullName, role = 'admin') => {
  assertValidRole(role);
  await setPersistence(auth, browserLocalPersistence);
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Save user profile & role in Firestore
  await setDoc(doc(db, 'users', user.uid), {
    id: user.uid,
    uid: user.uid,
    email,
    fullName,
    role,
    isActive: true,
    createdAt: new Date().toISOString()
  });

  return { user, role };
};

export const adminSendPasswordResetLink = async (email) => {
  await requireAdmin();
  const normalizedEmail = String(email || '').trim();
  if (!normalizedEmail) throw new Error('User email is required.');

  await sendPasswordResetEmail(auth, normalizedEmail);
  return { success: true };
};

// Logout service
export const logoutUser = async () => {
  await signOut(auth);
};

// Create a new user with a specific role (Admin action)
export const createUserWithRole = async (email, password, role, fullName) => {
  await requireAdmin();
  assertValidRole(role);
  const secondaryAppName = 'SecondaryApp';
  let secondaryApp;
  
  const existingApps = getApps();
  const foundApp = existingApps.find(app => app.name === secondaryAppName);
  
  if (foundApp) {
    secondaryApp = foundApp;
  } else {
    secondaryApp = initializeApp(auth.app.options, secondaryAppName);
  }
  
  const { getAuth: getSecAuth, createUserWithEmailAndPassword: sec, signOut: secSignOut } = await import('firebase/auth');
  const secAuth = getSecAuth(secondaryApp);
  
  const userCredential = await sec(secAuth, email, password);
  const newUser = userCredential.user;

  // Save user profile & role in Firestore
  await setDoc(doc(db, 'users', newUser.uid), {
    id: newUser.uid,
    uid: newUser.uid,
    email,
    fullName,
    role,
    isActive: true,
    createdAt: new Date().toISOString()
  });

  // Clean up secondary auth session safely
  await secSignOut(secAuth);
  return newUser;
};

// Fetch all users for admin management view
export const getAllUsers = async () => {
  await requireAdmin();
  const querySnapshot = await getDocs(collection(db, 'users'));
  const users = [];
  querySnapshot.forEach((docSnap) => {
    users.push({ id: docSnap.id, ...docSnap.data() });
  });
  return users;
};

// Update user role
export const updateUserRole = async (userId, newRole) => {
  await requireAdmin();
  assertValidRole(newRole);
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { role: newRole });
};

export const updateUserStatus = async (userId, isActive) => {
  const currentUser = await requireAdmin();
  if (!userId) throw new Error('User ID is required.');
  if (String(currentUser.uid) === String(userId) && !isActive) {
    throw new Error('You cannot disable your own administrator account.');
  }
  await updateDoc(doc(db, 'users', userId), {
    isActive: Boolean(isActive),
    statusUpdatedAt: new Date().toISOString(),
    statusUpdatedBy: currentUser.uid
  });
};

// Delete user record from Firestore
export const deleteUserAccount = async (userId) => {
  await requireAdmin();
  const userRef = doc(db, 'users', userId);
  await deleteDoc(userRef);
};