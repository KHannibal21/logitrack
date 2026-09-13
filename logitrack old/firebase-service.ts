// services/firebase-service.ts
// ✅ “Сеньорская” версия: один источник правды для app/auth/db, RN persistence, чистые мапперы,
// ✅ без undefined в Firestore, нормальная обработка Timestamp/Date, аккуратные realtime listeners.
// ✅ + Tracking: courierLocation {latitude, longitude, updatedAt} + courierLocationUpdatedAt (serverTimestamp)
// ✅ + Client cancel while pending/accepted (even if courier assigned)
// ✅ + listenCourierLastOrder() for courier active-order screen

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  QuerySnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

// ==================== FIREBASE INIT (ONE SOURCE OF TRUTH) ====================
// ⚠️ В идеале firebaseConfig хранить в .env, но оставляю как у тебя.

const firebaseConfig = {
  apiKey: ' ',
  authDomain: 'logitrack-c6ec0.firebaseapp.com',
  projectId: 'logitrack-c6ec0',
  storageBucket: 'logitrack-c6ec0.firebasestorage.app',
  messagingSenderId: '733578173839',
  appId: '1:733578173839:web:9169461fd72d411c4e3ffa',
  measurementId: 'G-42DL0HN6M0',
};

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Всегда пытаемся поднять RN-auth с persistence.
// ✅ Если уже инициализирован (Fast Refresh / hot reload) — берём существующий.
const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
})();

const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db };

// ==================== TYPES ====================

export type UserRole = 'client' | 'courier';

export interface AppUser {
  uid: string;
  email: string | null;
  role: UserRole;
  name: string;
  phone?: string | null;
  createdAt?: Date; // в Firestore это Timestamp, в UI — Date
}

export type LatLng = { latitude: number; longitude: number };

export type PaymentMethod = 'cash' | 'transfer';

export type OrderStatus = 'pending' | 'accepted' | 'inProgress' | 'delivered' | 'cancelled';

export type CancelledBy = 'client' | 'courier' | 'system';

export type CourierLocation = {
  latitude: number;
  longitude: number;
  updatedAt: number; // Date.now() from courier device (for "freshness")
};

export interface Order {
  id?: string;

  clientId: string;

  // “вшитые” контакты клиента (курьер видит без чтения /users/{uid})
  clientName?: string;
  clientEmail?: string | null;
  clientPhone?: string | null;

  pickupAddress: string;
  pickupCoords?: LatLng;

  dropoffAddress: string;
  dropoffCoords?: LatLng;

  price: number;
  paymentMethod: PaymentMethod;

  status: OrderStatus;

  createdAt?: Date;

  acceptedBy?: string;
  acceptedAt?: Date;

  completedAt?: Date;

  cancelledAt?: Date;
  cancelledBy?: CancelledBy;

  comment?: string;

  // courier snapshot into order
  courierId?: string;
  courierName?: string;
  courierEmail?: string | null;
  courierPhone?: string | null;

  // realtime tracking
  courierLocation?: CourierLocation;
  courierLocationUpdatedAt?: Date;
}

export type UserAddress = {
  id?: string;
  name: string;
  address: string;
  coords?: LatLng;
  isDefault?: boolean;
  createdAt?: Date;
};

// ==================== UTILS ====================

function isFiniteDate(d: any): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

/** Firestore Timestamp / raw ts / ms / string -> Date */
function toJsDate(v: any): Date | undefined {
  if (!v) return undefined;

  // Firestore Timestamp
  if (typeof v === 'object' && typeof v.toDate === 'function') {
    const d = v.toDate();
    return isFiniteDate(d) ? d : undefined;
  }

  // raw ts {seconds, nanoseconds} or {_seconds,_nanoseconds}
  const seconds =
    typeof v?.seconds === 'number'
      ? v.seconds
      : typeof v?._seconds === 'number'
        ? v._seconds
        : null;

  const nanos =
    typeof v?.nanoseconds === 'number'
      ? v.nanoseconds
      : typeof v?._nanoseconds === 'number'
        ? v._nanoseconds
        : 0;

  if (seconds !== null) {
    const ms = seconds * 1000 + Math.floor(nanos / 1e6);
    const d = new Date(ms);
    return isFiniteDate(d) ? d : undefined;
  }

  // epoch ms
  if (typeof v === 'number') {
    const d = new Date(v);
    return isFiniteDate(d) ? d : undefined;
  }

  // ISO string
  if (typeof v === 'string') {
    const d = new Date(v);
    return isFiniteDate(d) ? d : undefined;
  }

  return undefined;
}

/** Убирает undefined (Firestore не любит undefined) */
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function normalizeEmail(data: any): string | null {
  return (data?.email ?? data?.mail ?? null) as string | null;
}

function normalizePhone(data: any): string | null {
  return (data?.phone ?? data?.phoneNumber ?? data?.phone_number ?? data?.mobile ?? null) as string | null;
}

function mapUser(uid: string, data: any): AppUser {
  return {
    uid,
    email: normalizeEmail(data),
    role: (data?.role ?? 'client') as UserRole,
    name: data?.name ?? '',
    phone: normalizePhone(data),
    createdAt: toJsDate(data?.createdAt),
  };
}

function mapCourierLocation(v: any): CourierLocation | undefined {
  if (!v) return undefined;
  const lat = Number(v.latitude);
  const lng = Number(v.longitude);
  const updatedAt = Number(v.updatedAt);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(updatedAt)) return undefined;
  return { latitude: lat, longitude: lng, updatedAt };
}

function mapOrder(id: string, data: any): Order {
  return {
    id,
    clientId: data?.clientId ?? '',

    clientName: data?.clientName ?? '',
    clientEmail: data?.clientEmail ?? null,
    clientPhone: data?.clientPhone ?? null,

    pickupAddress: data?.pickupAddress ?? '',
    pickupCoords: data?.pickupCoords ?? undefined,

    dropoffAddress: data?.dropoffAddress ?? '',
    dropoffCoords: data?.dropoffCoords ?? undefined,

    price: Number(data?.price ?? 0),
    paymentMethod: (data?.paymentMethod ?? 'cash') as PaymentMethod,

    status: (data?.status ?? 'pending') as OrderStatus,

    createdAt: toJsDate(data?.createdAt),

    acceptedBy: data?.acceptedBy ?? undefined,
    acceptedAt: toJsDate(data?.acceptedAt),

    completedAt: toJsDate(data?.completedAt),

    cancelledAt: toJsDate(data?.cancelledAt),
    cancelledBy: (data?.cancelledBy ?? undefined) as CancelledBy | undefined,

    comment: data?.comment ?? undefined,

    courierId: data?.courierId ?? data?.acceptedBy ?? undefined,
    courierName: data?.courierName ?? '',
    courierEmail: data?.courierEmail ?? null,
    courierPhone: data?.courierPhone ?? null,

    courierLocation: mapCourierLocation(data?.courierLocation),
    courierLocationUpdatedAt: toJsDate(data?.courierLocationUpdatedAt),
  };
}

// ==================== AUTH ====================

export const getCurrentFirebaseUser = (): FirebaseUser | null => auth.currentUser;

export const getUserProfile = async (uid: string): Promise<AppUser> => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('Пользователь не найден');
  return mapUser(uid, snap.data());
};

export const updateUserProfile = async (uid: string, data: Partial<AppUser>): Promise<void> => {
  const userRef = doc(db, 'users', uid);

  // createdAt обычно не обновляем
  const payload = stripUndefined({
    email: data.email ?? undefined,
    role: data.role ?? undefined,
    name: data.name ?? undefined,
    phone: data.phone ?? undefined,
  });

  await updateDoc(userRef, payload);
};

export const signUp = async (
  email: string,
  password: string,
  userData: Omit<AppUser, 'uid' | 'email' | 'createdAt'>
): Promise<AppUser> => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const fu = cred.user;

    const newUser: AppUser = {
      uid: fu.uid,
      email: fu.email,
      ...userData,
      createdAt: new Date(),
    };

    await setDoc(doc(db, 'users', fu.uid), {
      uid: newUser.uid,
      email: newUser.email,
      role: newUser.role,
      name: newUser.name,
      phone: newUser.phone ?? null,
      createdAt: Timestamp.fromDate(newUser.createdAt),
    });

    return newUser;
  } catch (error: any) {
    const code = error?.code;
    if (code === 'auth/email-already-in-use') throw new Error('Этот email уже зарегистрирован. Нажмите “Войти”.');
    if (code === 'auth/invalid-email') throw new Error('Некорректный email.');
    if (code === 'auth/weak-password') throw new Error('Слишком простой пароль (минимум 6 символов).');
    throw new Error(error?.message ?? 'Ошибка регистрации');
  }
};

export const signIn = async (email: string, password: string): Promise<AppUser> => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const fu = cred.user;

    const docRef = doc(db, 'users', fu.uid);
    const snap = await getDoc(docRef);

    // Если профиля нет — создаём “фоллбек” (лучше, чем падать)
    if (!snap.exists()) {
      const fallback: AppUser = {
        uid: fu.uid,
        email: fu.email,
        role: 'client',
        name: fu.email ?? 'User',
        createdAt: new Date(),
      };

      await setDoc(docRef, {
        uid: fallback.uid,
        email: fallback.email,
        role: fallback.role,
        name: fallback.name,
        phone: null,
        createdAt: Timestamp.fromDate(fallback.createdAt),
      });

      return fallback;
    }

    return mapUser(fu.uid, snap.data());
  } catch (error: any) {
    const code = error?.code;
    if (code === 'auth/invalid-email') throw new Error('Введите корректный email.');
    if (code === 'auth/user-not-found') throw new Error('Аккаунт не найден.');
    if (code === 'auth/wrong-password') throw new Error('Неверный пароль.');
    if (code === 'auth/invalid-credential') throw new Error('Неверный email или пароль.');
    throw new Error(error?.message ?? 'Ошибка входа');
  }
};

export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

export async function requestPasswordReset(email: string) {
  const clean = email.trim().toLowerCase();
  await sendPasswordResetEmail(auth, clean);
}

/**
 * ✅ Подписка на auth-state + загрузка профиля из /users/{uid}
 * Важно: защищаемся от гонок (быстрый logout/login) через seq.
 */
export const onAuthStateChange = (callback: (user: AppUser | null) => void): (() => void) => {
  let seq = 0;

  return onAuthStateChanged(auth, async (fu: FirebaseUser | null) => {
    const mySeq = ++seq;

    if (!fu) {
      callback(null);
      return;
    }

    try {
      const profile = await getUserProfile(fu.uid);
      if (mySeq === seq) callback(profile);
    } catch {
      if (mySeq === seq) callback(null);
    }
  });
};

// ==================== STORAGE ====================

export const uploadFile = async (uri: string, path: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
};

// ==================== ORDERS ====================

export type CreateOrderInput = {
  clientId: string;

  pickupAddress: string;
  pickupCoords?: LatLng;

  dropoffAddress: string;
  dropoffCoords?: LatLng;

  price: number;
  paymentMethod: PaymentMethod;

  comment?: string;
};

export const createOrder = async (input: CreateOrderInput): Promise<string> => {
  try {
    if (!input?.clientId) throw new Error('clientId обязателен');
    if (!input.pickupAddress?.trim()) throw new Error('pickupAddress обязателен');
    if (!input.dropoffAddress?.trim()) throw new Error('dropoffAddress обязателен');
    if (!Number.isFinite(input.price) || input.price <= 0) throw new Error('Некорректная цена');

    // профиль клиента (чтобы “вшить” контакты в заказ)
    const userSnap = await getDoc(doc(db, 'users', input.clientId));
    if (!userSnap.exists()) throw new Error('Профиль клиента не найден');

    const u: any = userSnap.data();
    const clientName = u?.name ?? '';
    const clientEmail = normalizeEmail(u);
    const clientPhone = normalizePhone(u);

    const payload = stripUndefined({
      clientId: input.clientId,

      clientName,
      clientEmail,
      clientPhone,

      pickupAddress: input.pickupAddress.trim(),
      pickupCoords: input.pickupCoords ?? undefined,

      dropoffAddress: input.dropoffAddress.trim(),
      dropoffCoords: input.dropoffCoords ?? undefined,

      price: input.price,
      paymentMethod: input.paymentMethod,

      comment: input.comment?.trim() ? input.comment.trim() : undefined,

      status: 'pending' as OrderStatus,
      createdAt: serverTimestamp(),

      // tracking init (НЕ пишем undefined, иначе rules/Firestore могут ругаться)
      // courierLocation / courierLocationUpdatedAt просто отсутствуют
    });

    const docRef = await addDoc(collection(db, 'orders'), payload);
    return docRef.id;
  } catch (e: any) {
    console.error('createOrder error:', e);
    throw new Error(e?.message ?? 'Ошибка создания заказа');
  }
};

export const acceptOrder = async (orderId: string, courierId: string): Promise<void> => {
  if (!orderId) throw new Error('orderId обязателен');
  if (!courierId) throw new Error('courierId обязателен');

  const orderRef = doc(db, 'orders', orderId);
  const courierRef = doc(db, 'users', courierId);

  await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Order not found');

    const orderData: any = orderSnap.data();
    if (orderData.status !== 'pending') throw new Error('Order already accepted');

    const courierSnap = await tx.get(courierRef);
    if (!courierSnap.exists()) throw new Error('Courier profile not found');

    const c: any = courierSnap.data();
    const courierName = c?.name ?? 'Курьер';
    const courierEmail = normalizeEmail(c);
    const courierPhone = normalizePhone(c);

    tx.update(
      orderRef,
      stripUndefined({
        status: 'accepted' as OrderStatus,
        acceptedBy: courierId,
        acceptedAt: serverTimestamp(),

        // дублируем курьера в заказ (чтобы клиенту не надо читать /users)
        courierId,
        courierName,
        courierEmail,
        courierPhone,
      })
    );
  });
};

export const updateOrderStatus = async (
  orderId: string,
  status: OrderStatus,
  additionalData?: Partial<Order>
): Promise<void> => {
  if (!orderId) throw new Error('orderId обязателен');

  const orderRef = doc(db, 'orders', orderId);

  const updateData: any = { status };

  if (status === 'delivered') updateData.completedAt = serverTimestamp();
  if (status === 'cancelled') {
    updateData.cancelledAt = serverTimestamp();
    // ⚠️ кто отменил — задаём явно снаружи в cancelOrder, тут не угадываем
  }

  if (additionalData) {
    // дополнительные поля — только безопасные
    Object.assign(
      updateData,
      stripUndefined({
        comment: additionalData.comment ?? undefined,
      })
    );
  }

  await updateDoc(orderRef, updateData);
};

/**
 * ✅ Cancel by client/courier/system.
 * Для клиента: разрешено pending/accepted (по rules)
 */
export const cancelOrder = async (orderId: string, cancelledBy: CancelledBy = 'client'): Promise<void> => {
  if (!orderId) throw new Error('orderId обязателен');

  const orderRef = doc(db, 'orders', orderId);

  await updateDoc(orderRef, {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    cancelledBy,
  });
};

/**
 * ✅ Courier tracking.
 * Пишем courierLocation + server updatedAt.
 * Rules разрешают только курьеру и только на accepted/inProgress.
 */
export const updateCourierLocation = async (orderId: string, latitude: number, longitude: number): Promise<void> => {
  if (!orderId) throw new Error('orderId обязателен');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const orderRef = doc(db, 'orders', orderId);

  await updateDoc(orderRef, {
    courierLocation: {
      latitude,
      longitude,
      updatedAt: Date.now(),
    },
    courierLocationUpdatedAt: serverTimestamp(),
  });
};

// ==================== ORDERS: LISTENERS / FETCH ====================

export const getAvailableOrders = async (): Promise<Order[]> => {
  const refCol = collection(db, 'orders');
  const q = query(refCol, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapOrder(d.id, d.data()));
};

export const listenAvailableOrders = (callback: (orders: Order[]) => void, onError?: (e: any) => void) => {
  const refCol = collection(db, 'orders');
  const q = query(refCol, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapOrder(d.id, d.data()))),
    (err) => {
      console.error('listenAvailableOrders error:', err);
      onError?.(err);
      callback([]);
    }
  );
};

export const getClientOrders = async (clientId: string): Promise<Order[]> => {
  const refCol = collection(db, 'orders');
  const q = query(refCol, where('clientId', '==', clientId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapOrder(d.id, d.data()));
};

export const listenClientOrders = (
  clientId: string,
  callback: (orders: Order[]) => void,
  onError?: (e: any) => void
) => {
  const refCol = collection(db, 'orders');
  const q = query(refCol, where('clientId', '==', clientId), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapOrder(d.id, d.data()))),
    (err) => {
      console.error('listenClientOrders error:', err);
      onError?.(err);
      callback([]);
    }
  );
};

export const getCourierOrders = async (courierId: string): Promise<Order[]> => {
  const refCol = collection(db, 'orders');
  const q = query(refCol, where('acceptedBy', '==', courierId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapOrder(d.id, d.data()));
};

export const listenCourierOrders = (
  courierId: string,
  callback: (orders: Order[]) => void,
  opts?: { limitCount?: number },
  onError?: (e: any) => void
) => {
  const refCol = collection(db, 'orders');

  const q = query(
    refCol,
    where('acceptedBy', '==', courierId),
    orderBy('createdAt', 'desc'),
    ...(opts?.limitCount ? [limit(opts.limitCount)] : [])
  );

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapOrder(d.id, d.data()))),
    (err) => {
      console.error('listenCourierOrders error:', err);
      onError?.(err);
      callback([]);
    }
  );
};

// Активный заказ курьера (accepted / inProgress)
export const listenCourierActiveOrder = (
  courierId: string,
  callback: (order: Order | null) => void,
  onError?: (e: any) => void
) => {
  const refCol = collection(db, 'orders');

  const q = query(
    refCol,
    where('acceptedBy', '==', courierId),
    where('status', 'in', ['accepted', 'inProgress']),
    orderBy('createdAt', 'desc'),
    limit(1)
  );

  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        callback(null);
        return;
      }
      const d = snap.docs[0];
      callback(mapOrder(d.id, d.data()));
    },
    (err) => {
      console.error('listenCourierActiveOrder error:', err);
      onError?.(err);
      callback(null);
    }
  );
};

/**
 * ✅ LAST order of courier (включая cancelled/delivered)
 * Это и нужно для (courier)/active-order.tsx, чтобы показывать "последний заказ" даже если он уже завершён/отменён.
 *
 * ВАЖНО:
 * - Берём acceptedBy == courierId
 * - Сортируем по createdAt desc (универсально — оно есть у всех заказов)
 * - limit(1)
 *
 * Если хочешь строго по "acceptedAt", тогда надо гарантировать наличие acceptedAt у всех
 * и создать композитный индекс. Сейчас делаем без боли.
 */
export const listenCourierLastOrder = (
  courierId: string,
  onData: (order: Order | null) => void,
  onError?: (e: any) => void
): Unsubscribe => {
  const refCol = collection(db, 'orders');

  const q = query(refCol, where('acceptedBy', '==', courierId), orderBy('createdAt', 'desc'), limit(1));

  return onSnapshot(
    q,
    (snap: QuerySnapshot<DocumentData>) => {
      if (snap.empty) {
        onData(null);
        return;
      }
      const d = snap.docs[0];
      onData(mapOrder(d.id, d.data()));
    },
    (err) => {
      console.error('listenCourierLastOrder error:', err);
      onError?.(err);
      onData(null);
    }
  );
};

export const getOrderById = async (orderId: string): Promise<Order | null> => {
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return null;
  return mapOrder(snap.id, snap.data());
};

export const listenOrderById = (
  orderId: string,
  callback: (order: Order | null) => void,
  onError?: (e: any) => void
) => {
  const refDoc = doc(db, 'orders', orderId);
  return onSnapshot(
    refDoc,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(mapOrder(snap.id, snap.data()));
    },
    (err) => {
      console.error('listenOrderById error:', err);
      onError?.(err);
      callback(null);
    }
  );
};

// ==================== ADDRESSES ====================

export const listenUserAddresses = (
  uid: string,
  callback: (items: UserAddress[]) => void,
  onError?: (e: any) => void
) => {
  const refCol = collection(db, 'users', uid, 'addresses');
  const q = query(refCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          name: data?.name ?? '',
          address: data?.address ?? '',
          coords: data?.coords ?? undefined,
          isDefault: !!data?.isDefault,
          createdAt: toJsDate(data?.createdAt),
        } as UserAddress;
      });
      callback(items);
    },
    (err) => {
      console.error('listenUserAddresses error:', err);
      onError?.(err);
      callback([]);
    }
  );
};

export const addUserAddress = async (uid: string, data: Omit<UserAddress, 'id' | 'createdAt'>) => {
  const refCol = collection(db, 'users', uid, 'addresses');

  // если новый default — снимаем default со всех
  if (data.isDefault) {
    const snap = await getDocs(refCol);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { isDefault: false })));
  }

  await addDoc(
    refCol,
    stripUndefined({
      name: data.name?.trim(),
      address: data.address?.trim(),
      coords: data.coords ?? undefined,
      isDefault: !!data.isDefault,
      createdAt: serverTimestamp(),
    })
  );
};

export const updateUserAddress = async (uid: string, addressId: string, data: Partial<UserAddress>) => {
  const refDoc = doc(db, 'users', uid, 'addresses', addressId);

  if (data.isDefault) {
    const refCol = collection(db, 'users', uid, 'addresses');
    const snap = await getDocs(refCol);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { isDefault: d.id === addressId })));
    return;
  }

  await updateDoc(
    refDoc,
    stripUndefined({
      name: data.name?.trim(),
      address: data.address?.trim(),
      coords: data.coords ?? undefined,
      isDefault: data.isDefault ?? undefined,
    })
  );
};

export const deleteUserAddress = async (uid: string, addressId: string) => {
  await deleteDoc(doc(db, 'users', uid, 'addresses', addressId));
};
