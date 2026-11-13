// Autorización explícita (Ley 1581) que se muestra al vincular una clínica
export default function ConsentText({ pet, checked, onChange, clinicName = 'la clínica' }) {
  return (
    <label className="check consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Autorizo a {clinicName} a consultar la historia clínica de {pet?.name ?? 'mi mascota'} y a registrar vacunas, controles y consultas. La clínica verá mi
        nombre y mi correo para hacer seguimiento. Puedo quitar este acceso cuando quiera (Ley 1581 de 2012).
      </span>
    </label>
  );
}

