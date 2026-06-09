import { RadioProvider } from "./RadioContext";
import { RadioPage } from "./RadioPage";

export default function App() {
  return (
    <RadioProvider>
      <RadioPage />
    </RadioProvider>
  );
}
