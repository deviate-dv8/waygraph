/**
 * DOM selectors for the login route (`/`) and its logout burger menu.
 * Convention: DOM strings live in `*Sel` next to the page, not inlined in
 * each Block.
 */
export const LoginSel = {
  username: "#user-name",
  password: "#password",
  loginButton: "#login-button",
  errorBanner: '[data-test="error"]',
  burgerMenuButton: "#react-burger-menu-btn",
  logoutLink: "#logout_sidebar_link",
};
