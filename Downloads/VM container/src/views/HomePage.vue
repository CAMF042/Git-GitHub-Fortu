<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { getFirebaseServices } from '../firebase'

interface RecordItem {
  id: string
  title: string
  description: string
}

const currentUser = ref<User | null>(null)
const records = ref<RecordItem[]>([])
const email = ref('')
const password = ref('')
const title = ref('')
const description = ref('')
const editingId = ref<string | null>(null)
const isRegistering = ref(false)
const loadingSession = ref(true)
const loadingRecords = ref(false)
const recordsLoadError = ref('')
const recordsFromCache = ref(false)
const submitting = ref(false)
const pendingWrites = ref(0)
const errorMessage = ref('')
const statusMessage = ref('')

let unsubscribeAuth: (() => void) | undefined
let unsubscribeRecords: (() => void) | undefined
let recordsLoadTimer: ReturnType<typeof setTimeout> | undefined

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function clearRecordsLoadTimer() {
  if (recordsLoadTimer) {
    clearTimeout(recordsLoadTimer)
    recordsLoadTimer = undefined
  }
}

function trackWrite(operation: Promise<unknown>, successMessage: string) {
  pendingWrites.value += 1
  void operation
    .then(() => {
      statusMessage.value = successMessage
    })
    .catch((error: unknown) => {
      errorMessage.value = messageFrom(error)
      statusMessage.value = ''
    })
    .finally(() => {
      pendingWrites.value -= 1
    })
}

function watchRecords(user: User) {
  unsubscribeRecords?.()
  clearRecordsLoadTimer()
  loadingRecords.value = true
  recordsLoadError.value = ''
  recordsFromCache.value = false
  errorMessage.value = ''
  recordsLoadTimer = setTimeout(() => {
    recordsLoadTimer = undefined
    if (loadingRecords.value || recordsFromCache.value) {
      loadingRecords.value = false
      recordsLoadError.value =
        'Firebase has not confirmed the saved records yet. Check your connection and try again.'
    }
  }, 15000)

  try {
    const { db } = getFirebaseServices()
    unsubscribeRecords = onSnapshot(
      query(collection(db, 'records'), where('ownerId', '==', user.uid)),
      { includeMetadataChanges: true },
      (snapshot) => {
        records.value = snapshot.docs.map((record) => {
          const data = record.data()
          return {
            id: record.id,
            title: typeof data.title === 'string' ? data.title : '',
            description:
              typeof data.description === 'string' ? data.description : '',
          }
        })
        recordsFromCache.value = snapshot.metadata.fromCache
        loadingRecords.value = false
        if (!snapshot.metadata.fromCache) {
          recordsLoadError.value = ''
          clearRecordsLoadTimer()
        }
      },
      (error) => {
        loadingRecords.value = false
        recordsLoadError.value = messageFrom(error)
        clearRecordsLoadTimer()
      },
    )
  } catch (error) {
    loadingRecords.value = false
    recordsLoadError.value = messageFrom(error)
    clearRecordsLoadTimer()
  }
}

function retryLoadRecords() {
  const user = currentUser.value
  if (user) watchRecords(user)
}

async function authenticate() {
  errorMessage.value = ''
  statusMessage.value = ''
  submitting.value = true

  try {
    const { auth } = getFirebaseServices()
    const normalizedEmail = email.value.trim()

    if (isRegistering.value) {
      await createUserWithEmailAndPassword(auth, normalizedEmail, password.value)
    } else {
      await signInWithEmailAndPassword(auth, normalizedEmail, password.value)
    }
    password.value = ''
  } catch (error) {
    errorMessage.value = messageFrom(error)
  } finally {
    submitting.value = false
  }
}

function startEditing(record: RecordItem) {
  editingId.value = record.id
  title.value = record.title
  description.value = record.description
  statusMessage.value = ''
  errorMessage.value = ''
}

function cancelEditing() {
  editingId.value = null
  title.value = ''
  description.value = ''
}

async function saveRecord() {
  if (submitting.value) return

  const user = currentUser.value
  const cleanTitle = title.value.trim()
  const cleanDescription = description.value.trim()

  if (!user || !cleanTitle || !cleanDescription) {
    errorMessage.value = 'Enter both a title and a description.'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  statusMessage.value = ''

  try {
    const { db } = getFirebaseServices()

    if (editingId.value) {
      const operation = updateDoc(doc(db, 'records', editingId.value), {
        title: cleanTitle,
        description: cleanDescription,
        updatedAt: serverTimestamp(),
      })
      trackWrite(operation, 'Record updated.')
    } else {
      const operation = addDoc(collection(db, 'records'), {
        ownerId: user.uid,
        title: cleanTitle,
        description: cleanDescription,
        createdAt: serverTimestamp(),
      })
      trackWrite(operation, 'Record added.')
    }
    cancelEditing()
    statusMessage.value = 'Waiting for Firebase to confirm the change.'
  } catch (error) {
    errorMessage.value = messageFrom(error)
  } finally {
    await nextTick()
    submitting.value = false
  }
}

async function removeRecord(record: RecordItem) {
  if (submitting.value) return

  if (!window.confirm(`Delete "${record.title}"?`)) {
    return
  }

  submitting.value = true
  errorMessage.value = ''
  statusMessage.value = ''

  try {
    const { db } = getFirebaseServices()
    const operation = deleteDoc(doc(db, 'records', record.id))
    trackWrite(operation, 'Record deleted.')
    statusMessage.value = 'Waiting for Firebase to confirm the change.'
  } catch (error) {
    errorMessage.value = messageFrom(error)
  } finally {
    await nextTick()
    submitting.value = false
  }
}

async function logout() {
  errorMessage.value = ''
  statusMessage.value = ''

  try {
    const { auth } = getFirebaseServices()
    await signOut(auth)
  } catch (error) {
    errorMessage.value = messageFrom(error)
  }
}

onMounted(() => {
  try {
    const { auth } = getFirebaseServices()
    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      currentUser.value = user
      loadingSession.value = false
      statusMessage.value = ''
      unsubscribeRecords?.()
      unsubscribeRecords = undefined
      clearRecordsLoadTimer()
      records.value = []
      recordsLoadError.value = ''
      recordsFromCache.value = false
      if (user) {
        watchRecords(user)
      }
    })
  } catch (error) {
    errorMessage.value = messageFrom(error)
    loadingSession.value = false
  }
})

onUnmounted(() => {
  unsubscribeAuth?.()
  unsubscribeRecords?.()
  clearRecordsLoadTimer()
})
</script>

<template>
  <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>My Firestore Records</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent class="ion-padding">
        <main class="page-content">
          <section class="intro">
            <p class="eyebrow">IONIC + FIREBASE</p>
            <h1>KUPAL</h1>
            <p class="subtitle">
              Create an account to save, update, and manage your records.
            </p>
          </section>

          <p v-if="errorMessage" class="feedback error" role="alert">
            {{ errorMessage }}
          </p>
          <p v-if="statusMessage" class="feedback success" role="status">
            {{ statusMessage }}
          </p>
          <p v-if="pendingWrites" class="feedback success" role="status">
            {{ pendingWrites }} change{{ pendingWrites === 1 ? '' : 's' }}
            waiting for Firebase confirmation.
          </p>

          <div v-if="loadingSession" class="loading" role="status">
            <IonSpinner name="crescent" />
            <span>Connecting to Firebase…</span>
          </div>

          <IonCard v-else-if="!currentUser" class="panel">
            <IonCardHeader>
              <IonCardTitle>
                {{ isRegistering ? 'Create your account' : 'Welcome back' }}
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <form class="form" @submit.prevent="authenticate">
                <IonInput
                  v-model="email"
                  type="email"
                  label="Email"
                  label-placement="stacked"
                  autocomplete="email"
                  required
                />
                <IonInput
                  v-model="password"
                  type="password"
                  label="Password"
                  label-placement="stacked"
                  autocomplete="current-password"
                  :minlength="6"
                  required
                />
                <IonButton
                  class="primary-button"
                  expand="block"
                  type="submit"
                  :disabled="submitting"
                >
                  {{ submitting ? 'Please wait...' : isRegistering ? 'Create account' : 'Sign in' }}
                </IonButton>
              </form>
              <IonButton
                fill="clear"
                expand="block"
                :disabled="submitting"
                @click="isRegistering = !isRegistering"
              >
                <template v-if="isRegistering">
                  Already have an account? Login
                </template>
                <template v-else>New here? Create an account</template>
              </IonButton>
              <p class="hint">
                Enable Email/Password sign-in in Firebase Authentication before
                creating an account.
              </p>
            </IonCardContent>
          </IonCard>

          <template v-else>
            <div class="account-bar">
              <span>{{ currentUser.email }}</span>
              <IonButton fill="clear" class="record-action-button" @click="logout">
                Sign out
              </IonButton>
            </div>

            <IonCard class="panel">
              <IonCardHeader>
                <IonCardTitle>
                  {{ editingId ? 'Update Fliers' : 'Add Bago' }}
                </IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <form class="form" @submit.prevent="saveRecord">
                  <IonInput
                    v-model="title"
                    label="Title"
                    label-placement="stacked"
                    :maxlength="120"
                    required
                  />
                  <IonTextarea
                    v-model="description"
                    label="Description"
                    label-placement="stacked"
                    :auto-grow="true"
                    :maxlength="2000"
                    required
                  />
                  <div class="form-actions">
                    <IonButton
                      class="primary-button"
                      type="submit"
                      :disabled="submitting"
                    >
                      {{ editingId ? 'Save changes' : 'Add record' }}
                    </IonButton>
                    <IonButton
                      v-if="editingId"
                      fill="outline"
                      type="button"
                      @click="cancelEditing"
                    >
                      Cancel
                    </IonButton>
                  </div>
                </form>
              </IonCardContent>
            </IonCard>

            <section class="records-section" aria-labelledby="records-heading">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">YOUR COLLECTION</p>
                  <h2 id="records-heading">Saved records</h2>
                </div>
                <span class="record-count">{{ records.length }}</span>
              </div>

              <div v-if="loadingRecords" class="loading" role="status">
                <IonSpinner name="crescent" />
                <span>Loading records…</span>
              </div>
              <template v-else>
                <div v-if="recordsLoadError" class="feedback error" role="alert">
                  <p>{{ recordsLoadError }}</p>
                  <IonButton
                    fill="outline"
                    type="button"
                    @click="retryLoadRecords"
                  >
                    Retry loading records
                  </IonButton>
                </div>
                <p
                  v-else-if="recordsFromCache"
                  class="feedback success"
                  role="status"
                >
                  Showing cached records while waiting for Firebase.
                </p>
                <p
                  v-if="recordsFromCache && records.length === 0"
                  class="empty-state"
                >
                  Waiting for Firebase to confirm your saved records…
                </p>
                <p
                  v-else-if="!recordsFromCache && records.length === 0 && !recordsLoadError"
                  class="empty-state"
                >
                  Nothing here yet. Add your first record above.
                </p>
                <IonList v-if="records.length > 0" class="record-list">
                  <IonItem v-for="record in records" :key="record.id">
                    <IonLabel class="ion-text-wrap">
                      <h3>{{ record.title }}</h3>
                      <p>{{ record.description }}</p>
                    </IonLabel>
                    <IonButton
                      slot="end"
                      fill="clear"
                      class="record-action-button"
                      type="button"
                      @click="startEditing(record)"
                    >
                      Edit
                    </IonButton>
                    <IonButton
                      slot="end"
                      fill="clear"
                      color="danger"
                      class="record-action-button"
                      type="button"
                      @click="removeRecord(record)"
                    >
                      Delete
                    </IonButton>
                  </IonItem>
                </IonList>
              </template>
            </section>
          </template>
        </main>
      </IonContent>
  </IonPage>
</template>
