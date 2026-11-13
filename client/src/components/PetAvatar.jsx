import { SPECIES, photoUrl } from '../lib/format.js';

const TINTS = ['#ece3fa', '#fdecc8', '#e3ecfb', '#fbe1e4', '#e9e3fb', '#dff3df'];

export default function PetAvatar({ pet, size = 48 }) {
  const style = { width: size, height: size };
  if (pet.photo_key) {
    return <img className="pet-avatar pet-photo" src={photoUrl(pet.photo_key)} alt="" style={style} loading="lazy" />;
  }
  const tint = TINTS[(pet.id ?? pet.pet_id ?? 0) % TINTS.length];
  return (
    <span className="pet-avatar" style={{ ...style, background: tint, fontSize: size * 0.5 }} aria-hidden="true">
      {SPECIES[pet.species]?.emoji ?? '🐾'}
    </span>
  );
}
