function getCountdown(unixTimestamp) {
    const now = Math.floor(Date.now() / 1000); // current Unix time in seconds
    let diff = unixTimestamp - now;

    if (diff <= 0) return "Launched - wait for dev launching token";

    const days = Math.floor(diff / (24 * 60 * 60));
    diff %= 24 * 60 * 60;

    const hours = Math.floor(diff / (60 * 60));
    diff %= 60 * 60;

    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;

    return `⏰ Launch in: ${days}d ${hours}h ${minutes}m ${seconds}s`;
}


module.exports = {
    getCountdown
}