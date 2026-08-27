export type DeviceType = "desktop" | "mobile";

const mobilePattern =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

const detectDeviceType = (userAgent = ""): DeviceType => {
  return mobilePattern.test(userAgent) ? "mobile" : "desktop";
};

export default detectDeviceType;
