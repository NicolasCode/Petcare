import { useEffect, useState } from 'react';
import { api } from './api.js';

// Directorio en memoria para el selector de clínica de los formularios (máx. 200 lugares)
let cache = null;

export function loadPlaces() {
  cache ??= api.get('/places').then((d) => d.places).catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

export function usePlaces() {
  const [places, setPlaces] = useState([]);
  useEffect(() => {
    let alive = true;
    loadPlaces()
      .then((p) => alive && setPlaces(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return places;
}

// Busca un lugar por nombre exacto (sin distinguir mayúsculas) para enlazar el registro al directorio
export const findPlaceByName = (places, name) => {
  const key = name?.trim().toLowerCase();
  return key ? places.find((p) => p.name.toLowerCase() === key) ?? null : null;
};
