# Suivi Appels J+3 — version Vercel + Supabase

Ce projet est la version en ligne (hébergée, avec connexion sécurisée) du dashboard.
Il remplace la version Claude Artifact : mêmes fonctionnalités, mais avec une vraie
base de données Supabase et un écran de connexion par email + mot de passe.

## Étape A — Base de données Supabase

1. Dans Supabase, ouvrir **SQL Editor** → New query, coller le contenu de
   `supabase_schema.sql`, et l'exécuter (bouton Run). Cela crée la table `contacts`
   avec la sécurité (Row Level Security : seules les personnes connectées peuvent
   lire/écrire).
2. Aller dans **Table Editor** → table `contacts` → bouton **Insert** →
   **Import data from spreadsheet**, et importer le fichier `contacts_export.csv`
   fourni à côté de ce README (c'est l'export de tes 59 contacts actuels).
3. Aller dans **Authentication** → **Users** → **Add user**, et créer un compte
   (email + mot de passe) pour toi, et pour chaque personne de l'équipe qui doit
   avoir accès au dashboard.
4. Aller dans **Project Settings** → **API**, et noter `Project URL` et
   `anon public key` — c'est ce qui ira dans les variables d'environnement à
   l'étape C.

## Étape B — Pousser le code sur GitHub

Dans ton dépôt **"Suivi appels First Timers"** (vide pour l'instant), pousser tout
le contenu de ce dossier (sauf `node_modules`, `.next`, `.env.local` — déjà exclus
via `.gitignore`). Concrètement, en local :

```bash
cd suivi-appels
git init
git remote add origin <URL de ton dépôt GitHub>
git add .
git commit -m "Version initiale du dashboard"
git branch -M main
git push -u origin main
```

(Si tu préfères, GitHub Desktop fait la même chose sans ligne de commande : ouvrir
le dossier comme dépôt local, puis "Publish branch" en le liant au dépôt distant.)

## Étape C — Déployer sur Vercel

1. Sur vercel.com, **Add New → Project**, choisir le dépôt GitHub
   "Suivi appels First Timers".
2. Vercel détecte automatiquement que c'est un projet Next.js — ne rien changer
   aux réglages de build.
3. Avant de cliquer sur Deploy, ouvrir **Environment Variables** et ajouter :
   - `NEXT_PUBLIC_SUPABASE_URL` = (le Project URL noté à l'étape A.4)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (la anon public key notée à l'étape A.4)
4. Cliquer sur **Deploy**. Au bout de 1-2 minutes, le site est en ligne à une URL
   du type `suivi-appels-xxxx.vercel.app`.

## Étape D — Vérification

- Ouvrir l'URL fournie par Vercel : tu dois arriver sur un écran de connexion.
- Se connecter avec l'email + mot de passe créés à l'étape A.3.
- Vérifier que les 59 contacts importés apparaissent bien dans "Tous les contacts".
- Tester l'ouverture d'une fiche, une modification, l'ajout d'un nouveau contact.

## Pour ajouter quelqu'un de l'équipe plus tard

Pas besoin de repasser par moi : dans Supabase → **Authentication** → **Users** →
**Add user**, créer son compte avec son email pro et un mot de passe temporaire
qu'il/elle pourra changer.

## Développement local (optionnel, si besoin de tester avant de déployer)

```bash
npm install
cp .env.local.example .env.local   # puis renseigner les deux valeurs Supabase
npm run dev
```

Le site est alors disponible sur http://localhost:3000
