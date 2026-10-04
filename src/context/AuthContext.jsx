// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalizeRole } from '../utils/roles';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!currentUser) {
        setUser(null);
        setUserRole(null);
        setLoading(false);
        return;
      }

      unsubscribeProfile = onSnapshot(doc(db, 'users', currentUser.uid), (userDoc) => {
        const userData = userDoc.exists() ? userDoc.data() : {};
        if (userData.isActive === false) {
          setUser(null);
          setUserRole(null);
          setLoading(false);
          signOut(auth).catch((error) => console.warn('Could not end disabled user session:', error));
          return;
        }

        const assignedRole = normalizeRole(userData.role);
        currentUser.role = assignedRole;
        currentUser.userRole = assignedRole;
        setUserRole(assignedRole);
        setUser(currentUser);
        setLoading(false);
      }, (error) => {
        console.warn('Could not fetch user profile; blocking access until it can be verified:', error.message);
        setUser(null);
        setUserRole(null);
        setLoading(false);
        signOut(auth).catch((signOutError) => console.warn('Could not end unverified user session:', signOutError));
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, currentUser: user, userRole, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);