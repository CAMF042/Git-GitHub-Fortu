# Ionic Firestore Records

An Ionic Vue CRUD app using Firebase Authentication and Cloud Firestore. Each
signed-in user can create, view, update, and delete their own records.

## Configure Firebase

1. In Firebase Console, create or select a project and register a web app.
2. Enable **Authentication > Email/Password**.
3. Create a Cloud Firestore database.
4. Copy `.env.example` to `.env` and fill in the Firebase web app configuration.
   The Firebase web config is intended for client apps; never put service-account
   credentials or private keys in this file.
5. Deploy the included owner-scoped Firestore rules to the same Firebase project:

   ```powershell
   npx firebase-tools login
   npx firebase-tools use --add
   npx firebase-tools deploy --only firestore:rules
   ```

The app reports configuration, authentication, and Firestore errors on screen.
Records are stored in the `records` collection and are restricted to their owner
by `firestore.rules`.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
# Fill in .env with your Firebase web app config before signing in.
npm run dev
```

Open [http://localhost:8101](http://localhost:8101). Build the production
assets with `npm run build`.

## Run with Docker

Build the image from this directory:

```powershell
docker build -t ionic-firestore-crud .
```

Run the app with your local Firebase settings (the `.env` file is not copied into
the image):

```powershell
docker run -d --name ionic-firestore-crud-container --env-file .env -p 8101:8100 ionic-firestore-crud
```

If you already created the container with placeholder settings, recreate it
after filling in `.env`:

```powershell
docker rm -f ionic-firestore-crud-container
docker run -d --name ionic-firestore-crud-container --env-file .env -p 8101:8100 ionic-firestore-crud
```

Visit [http://localhost:8101](http://localhost:8101). To inspect or manage the
container:

```powershell
docker ps
docker logs ionic-firestore-crud-container
docker stop ionic-firestore-crud-container
docker ps -a
docker start ionic-firestore-crud-container
docker rm -f ionic-firestore-crud-container
docker images
```

Stopping or removing the container does not delete the image or Firestore data.
