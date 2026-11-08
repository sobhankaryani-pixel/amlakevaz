import {installWheelValueGuard} from './shared/wheelValueGuard';
installWheelValueGuard();
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./shared/ErrorBoundary";
import "./styles.css";
import "./shared/professional-compact.css";
import "./shared/listing-rail.css";
document.documentElement.lang = "fa";
document.documentElement.dir = "rtl";
createRoot(document.getElementById("root")!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);

import {startAnalytics} from './shared/analytics';
startAnalytics();
