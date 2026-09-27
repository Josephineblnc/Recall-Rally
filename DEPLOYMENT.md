# Mise en ligne

Les fichiers [render.yaml](render.yaml), [supabase-schema.sql](supabase-schema.sql) et [.env.example](.env.example) sont prêts. Il reste à créer les comptes externes et à renseigner leurs valeurs privées.

## Supabase

1. Créer un projet Supabase.
2. Ouvrir **SQL Editor** et exécuter le contenu de `supabase-schema.sql`.
3. Dans **Authentication > Providers > Email**, activer le fournisseur Email.
4. Choisir si la confirmation email est obligatoire.
5. Copier l’URL du projet et la clé `anon` dans les variables Render :

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
HOST=0.0.0.0
ALLOW_REMOTE_API=true
```

Ne jamais utiliser la clé `service_role` dans ce projet.

## Déploiement Render

1. Créer un dépôt GitHub et y pousser le projet sans le fichier `.env`.
2. Créer un **Web Service** Render depuis ce dépôt.
3. Render détectera automatiquement `render.yaml`, ou utiliser les commandes suivantes :

```text
Build command: npm install
Start command: npm start
```

4. Ajouter les valeurs privées demandées par Render : `GEMINI_API_KEY`, `SUPABASE_URL` et `SUPABASE_ANON_KEY`.
5. Attendre le premier déploiement et noter l’URL `https://...onrender.com`.
6. Dans Supabase, ouvrir **Authentication > URL Configuration** et ajouter cette URL dans **Site URL** et **Redirect URLs**.
7. Tester la création d’un compte, la connexion, la sauvegarde d’un deck et une génération Gemini.

Le plan gratuit Render peut mettre le service en veille. Le premier chargement après une période inactive peut donc prendre quelques secondes.

## Test local

```sh
npm start
```

Utiliser HTTPS en production et conserver la clé Gemini uniquement dans les variables d’environnement du serveur. Les routes de progression et de génération exigent une session utilisateur Supabase lorsque l’API est exposée à distance.
