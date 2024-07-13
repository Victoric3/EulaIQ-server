const geolib = require("geolib");

function checkUserInfoChange(user, queryInfo) {
  const { location, ipAddress, deviceInfo } = queryInfo;

  // Check if location is more than one city away (e.g., 50 km)
  const locationChanged = !user.location.some((storedLocation) => {
    const distance = geolib.getDistance(
      {
        latitude: storedLocation.latitude,
        longitude: storedLocation.longitude,
      },
      { latitude: location.latitude, longitude: location.longitude }
    );
    // Assuming 50000 meters (50 km) as the threshold for being one city away
    return distance <= 50000;
  });
  // Check if IP address is different
  const ipAddressChanged = !user.ipAddress.includes(ipAddress);

  // Check if device info is different
  const deviceInfoChanged = !user.deviceInfo.some((storedDeviceInfo) => {
    return (
      storedDeviceInfo.deviceType === deviceInfo.deviceType &&
      storedDeviceInfo.os === deviceInfo.os &&
      storedDeviceInfo.appVersion === deviceInfo.appVersion &&
      storedDeviceInfo.uniqueIdentifier === deviceInfo.uniqueIdentifier
    );
  });
  // Return true if any of the checks indicate a change
  return locationChanged || ipAddressChanged || deviceInfoChanged;
}

function addUserInfo(user, queryInfo) {
  const { location, ipAddress, deviceInfo } = queryInfo;

  // Add location if it doesn't already exist
  const locationChanged = user.location.some((storedLocation) => {
    const distance = geolib.getDistance(
      {
        latitude: storedLocation.latitude,
        longitude: storedLocation.longitude,
      },
      { latitude: location.latitude, longitude: location.longitude }
    );
    // Assuming 50000 meters (50 km) as the threshold for being one city away
    return distance <= 50000;
  });
  if (!locationChanged) {
    user.location.push(location);
  }

  // Add IP address if it doesn't already exist
  if (!user.ipAddress.includes(ipAddress)) {
    user.ipAddress.push(ipAddress);
  }

  // Add device info if it doesn't already exist
  const deviceInfoExists = user.deviceInfo.some((storedDeviceInfo) => {
    return (
      storedDeviceInfo.deviceType === deviceInfo.deviceType &&
      storedDeviceInfo.os === deviceInfo.os &&
      storedDeviceInfo.appVersion === deviceInfo.appVersion &&
      storedDeviceInfo.uniqueIdentifier === deviceInfo.uniqueIdentifier
    );
  });
  if (!deviceInfoExists) {
    user.deviceInfo.push(deviceInfo);
  }
}

module.exports = { checkUserInfoChange, addUserInfo };
