import AppLayout from "@/views/layout/AppLayout";

// All of the app's chrome lives in AppLayout; the engine boots inside ThreeCanvas once
// a user is logged in and the body renders.
export default function App() {
  return <AppLayout />;
}
