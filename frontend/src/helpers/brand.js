const isVibHost = () => /(^|\.)vib\./i.test(window.location.hostname);

export const getBrand = () => {
  if (isVibHost()) {
    return {
      name: "VIB",
      logo: "/vector/brand-vib.svg",
      primary: "#39ACE7"
    };
  }

  return {
    name: "Chat CRM",
    logo: "/vector/brand-chat.svg",
    primary: "#FF9F00"
  };
};

export const getBrandName = () => getBrand().name;

export const resolveBrandName = remoteName => {
  const brand = getBrand();
  if (brand.name === "VIB") return brand.name;

  return remoteName && !/^ticketz$/i.test(remoteName.trim())
    ? remoteName
    : brand.name;
};
