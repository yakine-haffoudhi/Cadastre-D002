# Application Cadastre PCI D002 (Aisne)
PostGIS + API Node.js + Frontend Leaflet + OpenStreetMap

---

# Description complète du projet

Ce projet consiste à développer une application web permettant de visualiser les parcelles cadastrales du département de l’Aisne (02) à partir des données officielles Parcellaire Express (PCI) fournies par l’IGN.

L’application est composée de trois parties principales :

- une base de données PostGIS pour stocker les données cadastrales
- une API backend Node.js permettant d’interroger ces données
- une interface frontend web utilisant Leaflet et OpenStreetMap pour afficher les parcelles sur une carte interactive

Les données cadastrales sont importées depuis un fichier Shapefile (.SHP) fourni par l’IGN. Ce fichier contient la géométrie des parcelles ainsi que leurs attributs (numéro, section, commune, surface, etc.).

Ces données sont stockées dans PostgreSQL avec l’extension PostGIS, qui permet de gérer des données géographiques.

Le backend, développé avec Node.js et Express, expose plusieurs endpoints REST qui permettent :

- de récupérer une parcelle par son identifiant
- de récupérer toutes les parcelles visibles dans une zone géographique donnée
- de récupérer le propriétaire d’une parcelle via l’API MAJIC
- de récupérer les informations d’une entreprise via son numéro SIREN (bonus)

Le frontend est une page web utilisant Leaflet pour afficher les parcelles sur une carte OpenStreetMap. L’utilisateur peut naviguer sur la carte, zoomer et cliquer sur une parcelle pour afficher ses informations.

Lorsqu’une parcelle est cliquée, le frontend appelle l’API backend, qui interroge ensuite l’API MAJIC pour récupérer le numéro SIREN du propriétaire si celui-ci est une personne morale (entreprise, mairie, etc.).

Si un numéro SIREN est trouvé, le backend interroge ensuite l’API SIREN pour récupérer des informations complémentaires sur l’entreprise.

Ce projet permet donc de mettre en œuvre :

- la gestion de données géographiques avec PostGIS
- le développement d’une API REST
- la consommation d’API externes
- le développement d’une interface cartographique interactive

---

# Technologies utilisées

Backend

- PostgreSQL 16
- PostGIS 3.4
- Node.js
- Express
- pg
- dotenv

Frontend

- HTML
- JavaScript
- Leaflet
- OpenStreetMap

Données

- PCI Parcellaire Express (IGN)
- API MAJIC
- API SIREN

---

# 1. Téléchargement des données cadastrales

Télécharger les données officielles :

https://data.geopf.fr/telechargement/download/PARCELLAIRE-EXPRESS/PARCELLAIRE-EXPRESS_1-1__SHP_LAMB93_D002_2025-12-01/PARCELLAIRE-EXPRESS_1-1__SHP_LAMB93_D002_2025-12-01.7z

Extraire le fichier.

Vous devez obtenir les fichiers suivants :

PARCELLE.SHP  
PARCELLE.SHX  
PARCELLE.DBF  
PARCELLE.CPG  
PARCELLE.PRJ  

Exemple :

C:\Users\yakin\Downloads\Cadastre-D002\

---

# 2. Installation des prérequis

Installer :

- PostgreSQL 16
- PostGIS (via StackBuilder)
- Node.js

Vérifier :

node -v  
psql --version  

---

# 3. Création de la base de données

Créer la base :

cadastre

Connexion :

"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d cadastre

Activer PostGIS :

CREATE EXTENSION postgis;

Vérifier :

SELECT PostGIS_Version();

---

# 4. Import des données dans PostGIS

Commande :

"C:\Program Files\PostgreSQL\16\bin\shp2pgsql.exe" -s 2154 -I "C:\Users\yakin\Downloads\Cadastre-D002\PARCELLE.SHP" parcelles | "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d cadastre

Vérifier :

SELECT COUNT(*) FROM parcelles;

Résultat attendu :

999138

---

# 5. Installation de l’API

Aller dans le dossier :

cd cadastre-api

Installer dépendances :

npm install

Créer fichier .env :

PORT=3001  
DATABASE_URL=postgresql://postgres:yakine@localhost:5432/cadastre  

---

# 6. Lancement de l’API

node server.mjs

Résultat attendu :

API running: http://localhost:3001

Test :

http://localhost:3001/health

---

# 7. Endpoints disponibles

Parcelle par ID :

GET http://localhost:3001/parcelles/1

Parcelles visibles :

GET http://localhost:3001/parcelles-view?bbox=minLon,minLat,maxLon,maxLat

Propriétaire via MAJIC :

GET http://localhost:3001/parcelles/1/owner

Bonus infos entreprise :

GET http://localhost:3001/siren/552100554

---

# 8. Lancement du frontend

Aller dans :

cd frontend

Lancer :

npx serve .

Ouvrir :

http://localhost:3000

---

# 9. Utilisation

- ouvrir la carte
- zoomer à 14+
- les parcelles apparaissent
- cliquer sur une parcelle
- voir les informations et le SIREN

---

# 10. Structure du projet

Cadastre-D002  
│  
├── cadastre-api  
│   ├── server.mjs  
│   ├── package.json  
│   ├── .env  
│  
├── frontend  
│   ├── index.html  
│  
└── README.md  

---

# 11. Limitations

Les personnes physiques ne possèdent pas de SIREN dans MAJIC open data.

---

Yakine

Projet exercice technique Cadastre PCI
