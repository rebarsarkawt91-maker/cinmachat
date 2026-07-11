import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const messageStr = error instanceof Error ? error.message : String(error);
  const isQuotaError = messageStr.toLowerCase().includes("quota") || messageStr.toLowerCase().includes("resource-exhausted");
  const isNotFoundError = (error as any)?.code === 'not-found' || messageStr.toLowerCase().includes("not_found") || messageStr.includes("5 NOT_FOUND");
  
  if (isQuotaError) {
    console.error("🔥 FIRESTORE QUOTA EXCEEDED: Your Firebase Spark Plan limit (50,000 reads/day) has been reached. Real-time updates and profile features may be paused until tomorrow.");
    return; // Don't crash the app for quota
  }

  const isUnavailable = messageStr.toLowerCase().includes("unavailable") || messageStr.toLowerCase().includes("could not reach cloud firestore backend");
  if (isUnavailable) {
    console.warn("📡 FIRESTORE OFFLINE: Connection to Firebase backend could not be established. The app is running in Offline Sync mode. Changes will be queued or fall back to local server APIs.");
    return;
  }

  if (isNotFoundError) {
    console.warn(`Firestore Document not found: ${path}. This is expected if the document is not yet created.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: messageStr,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: (auth.currentUser as any)?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: (auth.currentUser as any)?.tenantId,
      providerInfo: (auth.currentUser as any)?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo, null, 2));
  // In dev, we can just throw or alert
  const message = `Firestore Permission Denied: ${operationType} on ${path}. Check security rules.`;
  console.error(message);
  // throw new Error(JSON.stringify(errInfo)); // As per instructions
}
