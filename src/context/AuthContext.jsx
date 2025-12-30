import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { db } from '../lib/firebase'; // Ensure this exports initialized db

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const auth = getAuth();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setLoading(true);
            if (currentUser) {
                // Fetch User Profile for Role & Extra Data
                try {
                    const profileRef = doc(db, 'userProfiles', currentUser.uid);
                    const profileSnap = await getDoc(profileRef);

                    if (profileSnap.exists()) {
                        const profileData = profileSnap.data();

                        // === ROLE NORMALIZATION ===
                        // Prompt requirement: "Normalizar y robustecer el manejo de roles"
                        const rawRole = profileData.role || "";
                        const normalizedRole = rawRole.toString().trim().toLowerCase(); // "admin" or "analyst"

                        console.log(`[Auth] User: ${currentUser.email} | Raw Role: ${rawRole} | Normalized: ${normalizedRole}`);

                        // Update profile with normalized role for internal use
                        const safeProfile = { ...profileData, role: normalizedRole };
                        setUserProfile(safeProfile);
                        setUser({ ...currentUser, ...safeProfile });
                    } else {
                        console.warn(`[Auth] No userProfile found for ${currentUser.uid}`);
                        // Don't auto-logout. Just set user without profile data (Guest/Invalid)
                        setUser({ ...currentUser, role: 'unknown' });
                        setUserProfile(null);
                    }
                } catch (error) {
                    console.error("[Auth] Error fetching user profile:", error);
                    // Critical: Do NOT signOut.
                    setUser({ ...currentUser, role: 'error' });
                }
            } else {
                setUser(null);
                setUserProfile(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [auth]);

    const login = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const logout = () => {
        return signOut(auth);
    };

    const value = {
        user,
        userProfile,
        loading,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
