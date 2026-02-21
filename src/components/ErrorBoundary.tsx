import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: "20px", color: "red", backgroundColor: "#fee", minHeight: "100vh", direction: "ltr", textAlign: "left" }}>
                    <h1>Runtime Error Caught</h1>
                    <p style={{ fontWeight: "bold" }}>{this.state.error?.toString()}</p>
                    <pre style={{ whiteSpace: "pre-wrap", background: "#fff", padding: "10px", border: "1px solid #ccc" }}>
                        {this.state.error?.stack}
                    </pre>
                    <pre style={{ whiteSpace: "pre-wrap", background: "#fff", padding: "10px", border: "1px solid #ccc", marginTop: "10px", fontSize: "12px" }}>
                        {this.state.errorInfo?.componentStack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}
