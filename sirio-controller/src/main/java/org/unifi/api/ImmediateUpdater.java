package org.unifi.api;

import java.io.IOException;

public class ImmediateUpdater extends AbstractUpdater {

    public ImmediateUpdater() throws IOException {
        super();
    }

    public ImmediateUpdater(int min, int max) throws IOException {
        super(min, max);
    }

    @Override
    public int applyLogic(int replicas) {
        return replicas;
    }
}
