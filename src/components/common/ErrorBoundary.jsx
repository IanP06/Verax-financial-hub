import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("ErrorBoundary atrapó un error: ", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-gray-100 text-gray-800 p-6">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full text-center">
                        <h1 className="text-3xl font-bold text-red-600 mb-4">¡Algo falló!</h1>
                        <p className="mb-6 text-gray-600">Ha ocurrido un error inesperado al renderizar esta pantalla.</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-[#355071] text-white rounded hover:bg-[#2c425e] font-semibold transition-colors"
                        >
                            Recargar Página
                        </button>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="mt-8 text-left bg-gray-50 p-4 rounded overflow-auto text-xs font-mono border border-gray-200">
                                <p className="font-bold text-red-500 mb-2">{this.state.error.toString()}</p>
                                <div className="text-gray-500 whitespace-pre-wrap">
                                    {this.state.errorInfo?.componentStack}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
