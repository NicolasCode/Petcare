import { Component } from 'react';

// Si algo falla al dibujar una pantalla, muestra un aviso en lugar de una página en blanco.
// Tras un despliegue, una pestaña vieja puede pedir un archivo que ya no existe: basta recargar
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const outdated = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message);
    return (
      <div className="page page-narrow">
        <div className="card empty" role="alert">
          <h1 className="h3">{outdated ? 'Hay una versión nueva de Kaimi' : 'Algo salió mal'}</h1>
          <p>{outdated ? 'Recarga la página para usar la última versión.' : 'No pudimos mostrar esta pantalla. Recarga la página; si sigue pasando, escríbenos a hola@kaimi.co.'}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
