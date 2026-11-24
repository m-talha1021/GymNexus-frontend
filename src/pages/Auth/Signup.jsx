
import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../../firebase/config";
import logo from "../../assets/logo.png";

function Signup({ onSignupSuccess, onLogin }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(result.user, {
        displayName: fullName
      });

      onSignupSuccess();
    } catch (err) {
      console.error("Signup failed:", err);

      const messages = {
        "auth/email-already-in-use":
          "An account with this email already exists. Please login instead.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password":
          "Password is too weak. Use at least 6 characters.",
        "auth/network-request-failed":
          "Network error. Check your connection and try again.",
      };

      setError(
        messages[err.code] ||
          "Could not create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSignup}>
        <div className="auth-brand">
          <img className="auth-logo" src={logo} alt="GymNexus Logo" />
        </div>
        <h1>Create GymNexus Account</h1>
        <p className="auth-subtitle">Register your gym owner account.</p>

        <input
          type="text"
          aria-label="Full Name"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />

        <input
          type="email"
          aria-label="Email Address"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          aria-label="Password"
          placeholder="Password (at least 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Creating Account..." : "Sign Up"}
        </button>

        <p className="auth-switch">
          Already registered?{" "}
          <button type="button" onClick={onLogin}>
            Login
          </button>
        </p>
      </form>
    </div>
  );
}

export default Signup;
