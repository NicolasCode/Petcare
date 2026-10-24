import { SPECIES } from '../lib/format.js';

const TINTS = ['#ece3fa', '#fdecc8', '#e3ecfb', '#fbe1e4', '#e9e3fb', '#dff3df'];

export default function PetAvatar({ pet, size = 48 }) {
  const tint = TINTS[(pet.id ?? 0) % TINTS.length];
  return (
    <span className="pet-avatar" style={{ width: size, height: size, background: tint, fontSize: size * 0.5 }} aria-hidden="true">
      {SPECIES[pet.species]?.emoji ?? '🐾'}
    </span>
  );
}
