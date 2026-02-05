import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

// CONFIGURATION
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';
const DEFAULT_PASSWORD = 'VERAX1234';

const ANALYSTS = [
    { email: "jeremiasreynoso41@gmail.com", name: "Jeremias" },
    { email: "rodrigo.caraballo@live.com.ar", name: "Rodrigo" },
    { email: "soofiperich@gmail.com", name: "Sofia" },
    { email: "nataliagambatese78@gmail.com", name: "Natalia" },
    { email: "eliemiliano2002@gmail.com", name: "Emiliano" },
    { email: "martinstomas_@hotmail.com", name: "Tomás" },
    { email: "pericharield@gmail.com", name: "Ariel" },
    { email: "jazzurra15@gmail.com", name: "Jazmin" },
    { email: "danibarretin@gmail.com", name: "Daniel" },
    { email: "clu75660@gmail.com", name: "Eugenia y Debora" },
    { email: "gb.asaavedra@gmail.com", name: "Ayelen" }
];

// MAIN
async function main() {
    console.log("🚀 Starting Bulk User Creation...");

    // 1. Initialize Admin SDK
    try {
        // Read JSON manually to avoid Import Assertions warnings/issues in some Node versions
        const serviceAccount = JSON.parse(await readFile(new URL(SERVICE_ACCOUNT_PATH, import.meta.url)));

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log(`✅ Firebase Admin Initialized (Project: ${serviceAccount.project_id})`);
    } catch (e) {
        console.error("❌ Error initializing Firebase Admin. Make sure 'serviceAccountKey.json' exists in root and is valid.");
        console.error(e.message);
        process.exit(1);
    }

    const auth = admin.auth();
    const db = admin.firestore();
    const batch = db.batch();

    let stats = { created: 0, existed: 0, updated: 0, errors: 0 };

    // 2. Process Users
    for (const user of ANALYSTS) {
        console.log(`\n👤 Processing: ${user.name} (${user.email})`);
        let uid = null;
        let isNewUser = false;

        // A. Auth: Check exist or Create
        try {
            const userRecord = await auth.getUserByEmail(user.email);
            uid = userRecord.uid;
            console.log(`   🔸 Auth: Exists (UID: ${uid})`);
            stats.existed++;
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                try {
                    const newUser = await auth.createUser({
                        email: user.email,
                        password: DEFAULT_PASSWORD,
                        displayName: user.name,
                        emailVerified: true
                    });
                    uid = newUser.uid;
                    isNewUser = true;
                    console.log(`   ✨ Auth: Created New User (UID: ${uid})`);
                    stats.created++;
                } catch (createErr) {
                    console.error(`   ❌ Auth Error: ${createErr.message}`);
                    stats.errors++;
                    continue;
                }
            } else {
                console.error(`   ❌ Auth Lookup Error: ${error.message}`);
                stats.errors++;
                continue;
            }
        }

        // B. Firestore: Usage Profile
        if (uid) {
            const userRef = db.collection('userProfiles').doc(uid);

            // Standard UserProfile Data
            // IMPORTANT: We include 'analystKey' matching the 'name' for the invoicing system mapping
            const profileData = {
                uid: uid,
                email: user.email,
                displayName: user.name,
                role: 'analyst',
                analystKey: user.name, // Link to logic system
                isActive: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (isNewUser) {
                profileData.createdAt = admin.firestore.FieldValue.serverTimestamp();
                batch.set(userRef, profileData);
                console.log(`   📝 Firestore: Scheduled Create Profile`);
            } else {
                // If exists, verify if we need to update info. We do merge for consistency.
                // We do NOT overwrite createdAt.
                batch.set(userRef, profileData, { merge: true });
                console.log(`   📝 Firestore: Scheduled Update Profile`);
            }
            stats.updated++;
        }
    }

    // 3. Commit Batch
    try {
        await batch.commit();
        console.log("\n✅ Firestore Batch Committed successfully.");
    } catch (e) {
        console.error("\n❌ Firestore Batch Failed:", e);
    }

    // Summary
    console.log("\n============================================");
    console.log("📊 SUMMARY");
    console.log(`   Total Processed: ${ANALYSTS.length}`);
    console.log(`   New Auth Users:  ${stats.created}`);
    console.log(`   Existing Auth:   ${stats.existed}`);
    console.log(`   Profiles Set:    ${stats.updated}`);
    console.log(`   Errors:          ${stats.errors}`);
    console.log("============================================");
}

main().catch(console.error);
